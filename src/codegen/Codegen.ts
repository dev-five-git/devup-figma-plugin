import { getComponentName } from '../utils'
import { toCamel } from '../utils/to-camel'
import { getProps } from './props'
import { getPositionProps } from './props/position'
import { getSelectorProps, sanitizePropertyName } from './props/selector'
import { getTransformProps } from './props/transform'
import { renderComponent, renderNode } from './render'
import { renderText } from './render/text'
import type { ComponentTree, NodeTree } from './types'
import { addPx } from './utils/add-px'
import { checkAssetNode } from './utils/check-asset-node'
import { checkSameColor } from './utils/check-same-color'
import { extractInstanceVariantProps } from './utils/extract-instance-variant-props'
import { getComponentPropertyDefinitions } from './utils/get-component-property-definitions'
import {
  getDevupComponentByNode,
  getDevupComponentByProps,
} from './utils/get-devup-component'
import { getPageNode } from './utils/get-page-node'
import { paddingLeftMultiline } from './utils/padding-left-multiline'
import { perfEnd, perfStart } from './utils/perf'
import { buildCssUrl } from './utils/wrap-url'

// Global cache for node.getMainComponentAsync() results.
// Multiple Codegen instances (from ResponsiveCodegen) process the same INSTANCE nodes,
// each calling getMainComponentAsync which is an expensive Figma IPC call.
// Keyed by instance node.id; stores the Promise to deduplicate concurrent calls.
const mainComponentCache = new Map<string, Promise<ComponentNode | null>>()

export function resetMainComponentCache(): void {
  mainComponentCache.clear()
}

function getMainComponentCached(
  node: InstanceNode,
): Promise<ComponentNode | null> {
  const cacheKey = node.id
  if (cacheKey) {
    const cached = mainComponentCache.get(cacheKey)
    if (cached) return cached
  }
  const promise = node.getMainComponentAsync()
  if (cacheKey) {
    mainComponentCache.set(cacheKey, promise)
  }
  return promise
}

// Global buildTree cache shared across all Codegen instances.
// ResponsiveCodegen creates multiple Codegen instances for the same component
// variants — without this, each instance rebuilds the entire subtree.
// Returns cloned trees (shallow-cloned props at every level) because
// downstream code mutates tree.props via Object.assign.
const globalBuildTreeCache = new Map<string, Promise<NodeTree>>()

export function resetGlobalBuildTreeCache(): void {
  globalBuildTreeCache.clear()
}

// Global asset node registry populated during buildTree().
// Tracks nodes classified as SVG/PNG assets so callers (e.g. export commands)
// can collect them without re-walking the Figma node tree via IPC.
const globalAssetNodes = new Map<
  string,
  { node: SceneNode; type: 'svg' | 'png' }
>()

export function resetGlobalAssetNodes(): void {
  globalAssetNodes.clear()
}

export function getGlobalAssetNodes(): ReadonlyMap<
  string,
  { node: SceneNode; type: 'svg' | 'png' }
> {
  return globalAssetNodes
}

/** Props that are purely layout/padding — safe to discard when collapsing a single-asset wrapper. */
const LAYOUT_ONLY_PROPS = new Set([
  'display',
  'flexDir',
  'gap',
  'justifyContent',
  'alignItems',
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'w',
  'h',
  'boxSize',
  'overflow',
  'maxW',
  'maxH',
  'minW',
  'minH',
  'aspectRatio',
  'flex',
])

/** Returns true if props contain visual styles (bg, border, position, etc.) beyond layout. */
function hasVisualProps(props: Record<string, unknown>): boolean {
  for (const key of Object.keys(props)) {
    if (props[key] != null && !LAYOUT_ONLY_PROPS.has(key)) return true
  }
  return false
}

/**
 * Recursively traverse a single-child chain to find a lone SVG asset leaf.
 * Matches both <Image src="...svg"> and mask-based <Box maskImage="url(...)">.
 * Returns the leaf NodeTree if every node in the chain has no visual props,
 * or null if the chain contains visual styling, branches, or is not an SVG.
 */
function findSingleSvgImageLeaf(tree: NodeTree): NodeTree | null {
  if (tree.children.length === 0) {
    // Match <Image src="*.svg">
    if (
      tree.component === 'Image' &&
      typeof tree.props.src === 'string' &&
      tree.props.src.endsWith('.svg')
    ) {
      return tree
    }
    // Match mask-based <Box maskImage="url('*.svg')">
    if (tree.component === 'Box' && typeof tree.props.maskImage === 'string') {
      return tree
    }
    return null
  }
  if (tree.children.length === 1 && !hasVisualProps(tree.props)) {
    return findSingleSvgImageLeaf(tree.children[0])
  }
  return null
}

/**
 * Get componentPropertyReferences from a node (if available).
 */
function getPropertyRefs(node: SceneNode): Record<string, string> | undefined {
  if (
    'componentPropertyReferences' in node &&
    node.componentPropertyReferences
  ) {
    return node.componentPropertyReferences as Record<string, string>
  }
  return undefined
}

/**
 * Check if a child node is bound to an INSTANCE_SWAP component property.
 * Returns the sanitized slot name if it is, undefined otherwise.
 */
function getInstanceSwapSlotName(
  node: SceneNode,
  swapSlots: Map<string, string>,
): string | undefined {
  if (swapSlots.size === 0) return undefined
  const refs = getPropertyRefs(node)
  if (refs?.mainComponent && swapSlots.has(refs.mainComponent)) {
    return swapSlots.get(refs.mainComponent)
  }
  return undefined
}

/**
 * Check if a child node is controlled by a BOOLEAN component property (visibility).
 * Returns the sanitized boolean prop name if it is, undefined otherwise.
 */
function getBooleanConditionName(
  node: SceneNode,
  booleanSlots: Map<string, string>,
): string | undefined {
  if (booleanSlots.size === 0) return undefined
  const refs = getPropertyRefs(node)
  if (refs?.visible && booleanSlots.has(refs.visible)) {
    return booleanSlots.get(refs.visible)
  }
  return undefined
}

/**
 * Check if a child node's text characters are bound to a TEXT component property.
 * Returns the sanitized text prop name if it is, undefined otherwise.
 */
function getTextPropName(
  node: SceneNode,
  textSlots: Map<string, string>,
): string | undefined {
  if (textSlots.size === 0) return undefined
  const refs = getPropertyRefs(node)
  if (refs?.characters && textSlots.has(refs.characters)) {
    return textSlots.get(refs.characters)
  }
  return undefined
}

/**
 * Recursively apply BOOLEAN conditions and TEXT bindings to nested descendants.
 * buildTree produces the tree structure but doesn't check BOOLEAN/TEXT bindings —
 * those are only available via componentPropertyReferences on the original Figma nodes.
 * This walks the tree and Figma node tree in parallel, applying conditions at every level.
 */
function applyNestedConditions(
  tree: NodeTree,
  node: SceneNode,
  booleanSlots: Map<string, string>,
  textSlots: Map<string, string>,
): void {
  // Skip component references and wrappers — their children aren't expanded in the tree
  if (tree.isComponent || tree.nodeType === 'WRAPPER') return
  if (!('children' in node) || tree.children.length === 0) return

  const figmaChildren = (node as SceneNode & ChildrenMixin).children
  const len = Math.min(figmaChildren.length, tree.children.length)

  for (let i = 0; i < len; i++) {
    const childTree = tree.children[i]
    const childNode = figmaChildren[i]

    if (!childTree.condition) {
      const conditionName = getBooleanConditionName(childNode, booleanSlots)
      if (conditionName) {
        childTree.condition = conditionName
      }
    }

    const textPropName = getTextPropName(childNode, textSlots)
    if (
      textPropName &&
      childTree.textChildren &&
      !childTree.textChildren[0]?.startsWith('{')
    ) {
      childTree.textChildren = [`{${textPropName}}`]
    }

    applyNestedConditions(childTree, childNode, booleanSlots, textSlots)
  }
}

/**
 * Shallow-clone a NodeTree — creates a new object so that per-instance
 * property reassignment (e.g., `tree.props = { ...tree.props, ...selectorProps }`)
 * doesn't leak across Codegen instances. Props object itself is shared by
 * reference — callers that need to merge create their own objects.
 */
function cloneTree(tree: NodeTree): NodeTree {
  return {
    component: tree.component,
    props: tree.props,
    children: tree.children,
    nodeType: tree.nodeType,
    nodeName: tree.nodeName,
    isComponent: tree.isComponent,
    isSlot: tree.isSlot,
    condition: tree.condition,
    textChildren: tree.textChildren,
  }
}

export class Codegen {
  components: Map<
    string,
    {
      node: SceneNode
      code: string
      variants: Record<string, string>
      variantComments?: Record<string, string>
    }
  > = new Map()
  code: string = ''

  // Tree representations
  private tree: NodeTree | null = null
  private componentTrees: Map<string, ComponentTree> = new Map()
  // Cache buildTree results by node.id to avoid duplicate subtree builds
  // (e.g., when addComponentTree and main tree walk process the same children)
  private buildTreeCache: Map<string, Promise<NodeTree>> = new Map()
  // Collect fire-and-forget addComponentTree promises so we can await them
  // before rendering component codes (decouples INSTANCE buildTree from addComponentTree)

  constructor(private node: SceneNode) {
    this.node = node
    // if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
    //   this.node = node.parent
    // } else {
    //   this.node = node
    // }
    // if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
    //   this.node = node.parent
    // } else {
    //   this.node = node
    // }
  }

  getCode() {
    return this.code
  }

  /**
   * Get the component tree built by addComponentTree for this node.
   * Unlike getTree(), which skips invisible children in buildTree(),
   * this tree includes ALL children with BOOLEAN conditions and
   * INSTANCE_SWAP slot placeholders preserved.
   * Returns undefined if no component tree was built (non-COMPONENT nodes).
   */
  getComponentTree(): ComponentTree | undefined {
    const nodeId = this.node.id || this.node.name
    return this.componentTrees.get(nodeId)
  }

  getComponentsCodes() {
    const result: Array<readonly [string, string]> = []
    for (const {
      node,
      code,
      variants,
      variantComments,
    } of this.components.values()) {
      const name = getComponentName(node)
      result.push([
        name,
        renderComponent(name, code, variants, variantComments),
      ])
    }
    return result
  }

  /**
   * Get the component nodes (SceneNode values from components Map).
   * Useful for generating responsive codes for each component.
   */
  getComponentNodes() {
    const result: SceneNode[] = []
    for (const { node } of this.components.values()) result.push(node)
    return result
  }

  /**
   * Run the codegen process: build tree and render to JSX string.
   */
  async run(node: SceneNode = this.node, depth: number = 0): Promise<string> {
    // Build the tree first
    const tree = await this.buildTree(node)

    // Render the tree to JSX string
    const ret = Codegen.renderTree(tree, depth)

    if (node === this.node) {
      this.code = ret
      this.tree = tree
    }

    // Drain all addComponentTree promises, including nested ones added during execution.
    // Uses addComponentTreePromises Map which stably tracks every fired promise.
    let _prevSize = 0
    while (this.addComponentTreePromises.size > _prevSize) {
      _prevSize = this.addComponentTreePromises.size
      await Promise.all(this.addComponentTreePromises.values())
    }

    // Sync componentTrees to components
    for (const [compId, compTree] of this.componentTrees) {
      if (!this.components.has(compId)) {
        this.components.set(compId, {
          node: compTree.node,
          code: Codegen.renderTree(compTree.tree, 0),
          variants: compTree.variants,
          variantComments: compTree.variantComments,
        })
      }
    }

    return ret
  }

  /**
   * Build a NodeTree representation of the node hierarchy.
   * This is the intermediate JSON representation that can be compared/merged.
   *
   * Uses a two-level cache:
   * 1. Global cache (across instances) — returns cloned trees to prevent mutation leaks
   * 2. Per-instance cache — returns the same promise within a single Codegen.run()
   */
  async buildTree(node: SceneNode = this.node): Promise<NodeTree> {
    const cacheKey = node.id
    if (cacheKey) {
      // Per-instance cache (same tree object reused within one Codegen)
      const instanceCached = this.buildTreeCache.get(cacheKey)
      if (instanceCached) return instanceCached

      // Global cache (shared across Codegen instances from ResponsiveCodegen).
      // Returns a CLONE because downstream code mutates tree.props.
      const globalCached = globalBuildTreeCache.get(cacheKey)
      if (globalCached) {
        const resolved = await globalCached
        const cloned = cloneTree(resolved)
        const clonedPromise = Promise.resolve(cloned)
        this.buildTreeCache.set(cacheKey, clonedPromise)
        return clonedPromise
      }
    }
    const promise = this.doBuildTree(node)
    if (cacheKey) {
      this.buildTreeCache.set(cacheKey, promise)
      globalBuildTreeCache.set(cacheKey, promise)
    }
    const result = await promise
    return result
  }

  private async doBuildTree(node: SceneNode): Promise<NodeTree> {
    const tBuild = perfStart()

    // Handle COMPONENT_SET or COMPONENT — fire addComponentTree BEFORE any early returns
    // (e.g., asset detection) so that BOOLEAN conditions and INSTANCE_SWAP slots are always
    // detected on children, even when the COMPONENT itself is classified as an asset.
    if (
      (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') &&
      ((this.node.type === 'COMPONENT_SET' &&
        node === this.node.defaultVariant) ||
        this.node.type === 'COMPONENT')
    ) {
      // Fire-and-forget — errors collected via addComponentTreePromises in run().
      this.addComponentTree(
        node.type === 'COMPONENT_SET' ? node.defaultVariant : node,
      )
    }

    // Handle native Figma SLOT nodes — render as {slotName} in the component.
    // SLOT is a newer Figma node type not yet in @figma/plugin-typings.
    // The slot name is sanitized here; addComponentTree renames single slots to 'children'.
    if ((node.type as string) === 'SLOT') {
      perfEnd('buildTree()', tBuild)
      return {
        component: toCamel(sanitizePropertyName(node.name)),
        props: {},
        children: [],
        nodeType: 'SLOT',
        nodeName: node.name,
        isSlot: true,
      }
    }

    // Handle INSTANCE nodes first — they only need position props (all sync),
    // skipping the expensive full getProps() with 6 async Figma API calls.
    // INSTANCE nodes must be checked before asset detection because icon-like
    // instances (containing only vectors) would otherwise be misclassified as SVG assets.
    if (node.type === 'INSTANCE') {
      const mainComponent = await getMainComponentCached(node)
      // Fire addComponentTree without awaiting — it runs in the background.
      // All pending promises are collected and awaited in run() before rendering.
      if (mainComponent) {
        this.addComponentTree(mainComponent)
      }

      const componentName = getComponentName(mainComponent || node)
      const variantProps = extractInstanceVariantProps(node)

      // Check for native SLOT children and build their overridden content.
      // SLOT children contain the content placed into the component's slot.
      // Group by slot name to distinguish single-slot (children) vs multi-slot (named props).
      const slotsByName = new Map<string, NodeTree[]>()
      if ('children' in node) {
        for (const child of node.children) {
          if ((child.type as string) === 'SLOT' && 'children' in child) {
            const slotName = toCamel(sanitizePropertyName(child.name))
            const content: NodeTree[] = []
            for (const slotContent of (child as SceneNode & ChildrenMixin)
              .children) {
              content.push(await this.buildTree(slotContent))
            }
            if (content.length > 0) {
              slotsByName.set(slotName, content)
            }
          }
        }
      }

      // Single SLOT → pass content as children (renders as <Comp>content</Comp>)
      // Multiple SLOTs → render each as a named JSX prop (renders as <Comp header={<X/>} content={<Y/>} />)
      let slotChildren: NodeTree[] = []
      if (slotsByName.size === 1) {
        const firstSlot = slotsByName.values().next().value
        if (firstSlot) {
          slotChildren = firstSlot
        }
      } else if (slotsByName.size > 1) {
        for (const [slotName, content] of slotsByName) {
          let jsx: string
          if (content.length === 1) {
            jsx = Codegen.renderTree(content[0], 0)
          } else {
            let childrenStr = ''
            for (let i = 0; i < content.length; i++) {
              if (i > 0) childrenStr += '\n'
              childrenStr += paddingLeftMultiline(
                Codegen.renderTree(content[i], 0),
                1,
              )
            }
            jsx = `<>\n${childrenStr}\n</>`
          }
          variantProps[slotName] = { __jsxSlot: true, jsx }
        }
      }

      // Only compute position + transform (sync, no Figma API calls)
      const posProps = getPositionProps(node)
      if (posProps?.pos) {
        const transformProps = getTransformProps(node)
        perfEnd('buildTree()', tBuild)
        return {
          component: 'Box',
          props: {
            pos: posProps.pos,
            top: posProps.top,
            left: posProps.left,
            right: posProps.right,
            bottom: posProps.bottom,
            transform: posProps.transform || transformProps?.transform,
            w:
              (getPageNode(node as BaseNode & ChildrenMixin) as SceneNode)
                ?.width === node.width
                ? '100%'
                : undefined,
          },
          children: [
            {
              component: componentName,
              props: variantProps,
              children: slotChildren,
              nodeType: node.type,
              nodeName: node.name,
              isComponent: true,
            },
          ],
          nodeType: 'WRAPPER',
          nodeName: `${node.name}_wrapper`,
        }
      }

      perfEnd('buildTree()', tBuild)
      return {
        component: componentName,
        props: variantProps,
        children: slotChildren,
        nodeType: node.type,
        nodeName: node.name,
        isComponent: true,
      }
    }

    // Handle asset nodes (images/SVGs)
    const assetNode = checkAssetNode(node)
    if (assetNode) {
      // Register in global asset registry for export commands
      const assetKey = `${assetNode}/${node.name}`
      if (!globalAssetNodes.has(assetKey)) {
        globalAssetNodes.set(assetKey, { node, type: assetNode })
      }
      const baseProps = await getProps(node)
      // Clone to avoid mutating the shared getProps cache — subsequent
      // codegen runs (e.g. ResponsiveCodegen) reuse the cached reference.
      const props: Record<string, unknown> = { ...baseProps }
      props.src = `/${assetNode === 'svg' ? 'icons' : 'images'}/${node.name}.${assetNode}`
      if (assetNode === 'svg') {
        const maskColor = await checkSameColor(node)
        if (maskColor) {
          props.maskImage = buildCssUrl(props.src as string)
          props.maskRepeat = 'no-repeat'
          props.maskSize = 'contain'
          props.maskPos = 'center'
          props.bg = maskColor
          delete props.src
        }
      }
      // Strip padding props from asset nodes — padding from inferredAutoLayout
      // is meaningless on asset elements (Image or mask-based Box).
      for (const key of Object.keys(props)) {
        if (
          key === 'p' ||
          key === 'px' ||
          key === 'py' ||
          key === 'pt' ||
          key === 'pr' ||
          key === 'pb' ||
          key === 'pl'
        ) {
          delete props[key]
        }
      }
      const assetComponent = 'src' in props ? 'Image' : 'Box'
      perfEnd('buildTree()', tBuild)
      return {
        component: assetComponent,
        props,
        children: [],
        nodeType: node.type,
        nodeName: node.name,
      }
    }

    // Fire getProps early for non-INSTANCE nodes — it runs while we process children.
    const propsPromise = getProps(node)

    // Build children sequentially — Figma's single-threaded IPC means
    // concurrent subtree builds add overhead without improving throughput,
    // and sequential order maximizes cache hits for shared nodes.
    const children: NodeTree[] = []
    if ('children' in node) {
      for (const child of node.children) {
        children.push(await this.buildTree(child))
      }
    }

    // Now await props (likely already resolved while children were processing)
    const baseProps = await propsPromise

    // Handle TEXT nodes — create NEW merged object instead of mutating getProps() result.
    let textChildren: string[] | undefined
    let props: Record<string, unknown>
    if (node.type === 'TEXT') {
      const { children: textContent, props: textProps } = await renderText(node)
      textChildren = textContent
      props = { ...baseProps, ...textProps }
    } else {
      props = baseProps
    }

    // When an icon-like node (isAsset) wraps a chain of single-child
    // layout-only wrappers ending in a single Image, collapse into
    // a direct Image using the node's outer dimensions.
    if (children.length === 1 && !hasVisualProps(baseProps)) {
      const imageLeaf = findSingleSvgImageLeaf(children[0])
      if (imageLeaf) {
        if (node.width === node.height) {
          imageLeaf.props.boxSize = addPx(node.width)
          delete imageLeaf.props.w
          delete imageLeaf.props.h
        } else {
          imageLeaf.props.w = addPx(node.width)
          imageLeaf.props.h = addPx(node.height)
        }
        perfEnd('buildTree()', tBuild)
        return {
          ...imageLeaf,
          nodeType: node.type,
          nodeName: node.name,
        }
      }
    }

    const component = getDevupComponentByNode(node, props)

    perfEnd('buildTree()', tBuild)
    return {
      component,
      props,
      children,
      nodeType: node.type,
      nodeName: node.name,
      textChildren,
    }
  }

  /**
   * Get the NodeTree representation of the node.
   * Builds the tree if not already built.
   */
  async getTree(): Promise<NodeTree> {
    if (!this.tree) {
      this.tree = await this.buildTree(this.node)
      // Drain all addComponentTree promises (including nested ones)
      let _prevSize = 0
      while (this.addComponentTreePromises.size > _prevSize) {
        _prevSize = this.addComponentTreePromises.size
        await Promise.all(this.addComponentTreePromises.values())
      }
    }
    return this.tree
  }

  /**
   * Get component trees (for COMPONENT_SET/COMPONENT nodes).
   */
  getComponentTrees(): Map<string, ComponentTree> {
    return this.componentTrees
  }

  /**
   * Add a component to componentTrees.
   */
  // Cache in-flight addComponentTree promises to prevent duplicate work
  // when multiple INSTANCE nodes reference the same component
  private addComponentTreePromises: Map<string, Promise<void>> = new Map()

  private addComponentTree(node: ComponentNode): Promise<void> {
    const nodeId = node.id || node.name
    if (this.componentTrees.has(nodeId)) return Promise.resolve()

    // If already in-flight, return the same promise
    const inflight = this.addComponentTreePromises.get(nodeId)
    if (inflight) return inflight

    // Store the raw promise (may reject) for drain in run().
    // Attach a no-op .catch so fire-and-forget callers don't
    // trigger unhandled rejection warnings.
    const promise = this.doAddComponentTree(node, nodeId)
    promise.catch(() => {})
    this.addComponentTreePromises.set(nodeId, promise)
    return promise
  }

  private async doAddComponentTree(
    node: ComponentNode,
    nodeId: string,
  ): Promise<void> {
    const tAdd = perfStart()

    // Reserve position in componentTrees so parent components appear
    // before their children in Map iteration order.
    // Map.set() with the same key later updates the value without changing position.
    this.componentTrees.set(nodeId, {
      name: getComponentName(node),
      node,
      tree: {
        component: '',
        props: {},
        children: [],
        nodeType: node.type,
        nodeName: node.name,
      },
      variants: {},
    })

    // Fire getProps + getSelectorProps early (2 independent API calls)
    const propsPromise = getProps(node)
    const t = perfStart()
    const selectorPropsPromise = getSelectorProps(node)

    // Collect INSTANCE_SWAP and BOOLEAN property definitions for slot/condition detection.
    const parentSet = node.parent?.type === 'COMPONENT_SET' ? node.parent : null
    const propDefs = parentSet
      ? getComponentPropertyDefinitions(parentSet)
      : getComponentPropertyDefinitions(node)
    const instanceSwapSlots = new Map<string, string>()
    const booleanSlots = new Map<string, string>()
    const textSlots = new Map<string, string>()
    for (const [key, def] of Object.entries(propDefs)) {
      if (def.type === 'INSTANCE_SWAP') {
        instanceSwapSlots.set(key, sanitizePropertyName(key))
      } else if (def.type === 'BOOLEAN') {
        booleanSlots.set(key, sanitizePropertyName(key))
      } else if (def.type === 'TEXT') {
        textSlots.set(key, sanitizePropertyName(key))
      }
    }
    if (textSlots.size === 1) {
      const [key] = [...textSlots.entries()][0]
      textSlots.set(key, 'children')
    }

    // Build children sequentially, replacing INSTANCE_SWAP targets with slot placeholders
    // and wrapping BOOLEAN-controlled children with conditional rendering.
    const childrenTrees: NodeTree[] = []
    if ('children' in node) {
      for (const child of node.children) {
        const slotName = getInstanceSwapSlotName(child, instanceSwapSlots)
        if (slotName) {
          const conditionName = getBooleanConditionName(child, booleanSlots)
          childrenTrees.push({
            component: slotName,
            props: {},
            children: [],
            nodeType: 'SLOT',
            nodeName: child.name,
            isSlot: true,
            condition: conditionName,
          })
        } else {
          const tree = await this.buildTree(child)
          const conditionName = getBooleanConditionName(child, booleanSlots)
          if (conditionName) {
            tree.condition = conditionName
          }
          const textPropName = getTextPropName(child, textSlots)
          if (textPropName && tree.textChildren) {
            tree.textChildren = [`{${textPropName}}`]
          }
          // Apply conditions to nested descendants (grandchildren and deeper)
          applyNestedConditions(tree, child, booleanSlots, textSlots)
          childrenTrees.push(tree)
        }
      }
    }

    // Await props + selectorProps (likely already resolved while children built)
    const [baseProps, selectorProps] = await Promise.all([
      propsPromise,
      selectorPropsPromise,
    ])
    perfEnd('getSelectorProps()', t)

    const variants: Record<string, string> = {}

    // Create a NEW merged object instead of mutating getProps() result.
    // This allows getProps cache to return raw references without cloning.
    const props = selectorProps
      ? { ...baseProps, ...selectorProps.props }
      : baseProps
    if (selectorProps) {
      Object.assign(variants, selectorProps.variants)
    }
    const variantComments = selectorProps?.variantComments || {}

    // Detect native SLOT children — single slot becomes 'children', multiple keep names.
    // Exclude INSTANCE_SWAP-created slots (they're already handled by selectorProps.variants).
    const instanceSwapNames = new Set(instanceSwapSlots.values())
    const nativeSlots = childrenTrees.filter(
      (child) =>
        child.nodeType === 'SLOT' &&
        child.isSlot &&
        !instanceSwapNames.has(child.component),
    )
    if (nativeSlots.length === 1) {
      // Single SLOT → rename to 'children' for idiomatic React
      nativeSlots[0].component = 'children'
      if (!variants.children) {
        variants.children = 'React.ReactNode'
      }
    } else if (nativeSlots.length > 1) {
      // Multiple SLOTs → keep sanitized names as individual React.ReactNode props
      for (const slot of nativeSlots) {
        if (!variants[slot.component]) {
          variants[slot.component] = 'React.ReactNode'
        }
      }
    }

    // When an icon-like component (isAsset) wraps a chain of single-child
    // layout-only wrappers ending in a single Image, collapse everything
    // into a direct Image using the component's outer dimensions.
    if (childrenTrees.length === 1 && !hasVisualProps(props)) {
      const imageLeaf = findSingleSvgImageLeaf(childrenTrees[0])
      if (imageLeaf) {
        if (node.width === node.height) {
          imageLeaf.props.boxSize = addPx(node.width)
          delete imageLeaf.props.w
          delete imageLeaf.props.h
        } else {
          imageLeaf.props.w = addPx(node.width)
          imageLeaf.props.h = addPx(node.height)
        }
        this.componentTrees.set(nodeId, {
          name: getComponentName(node),
          node,
          tree: {
            ...imageLeaf,
            nodeType: node.type,
            nodeName: node.name,
          },
          variants,
          variantComments,
        })
        perfEnd('addComponentTree()', tAdd)
        return
      }
    }

    this.componentTrees.set(nodeId, {
      name: getComponentName(node),
      node,
      tree: {
        component: getDevupComponentByProps(props),
        props,
        children: childrenTrees,
        nodeType: node.type,
        nodeName: node.name,
      },
      variants,
      variantComments,
    })
    perfEnd('addComponentTree()', tAdd)
  }

  /**
   * Check if the node is a COMPONENT_SET with viewport variant.
   */
  hasViewportVariant(): boolean {
    if (this.node.type !== 'COMPONENT_SET') return false
    for (const key in getComponentPropertyDefinitions(
      this.node as ComponentSetNode,
    )) {
      if (key.toLowerCase() === 'viewport') return true
    }
    return false
  }

  /**
   * Render a NodeTree to JSX string.
   * Static method so it can be used independently.
   */
  static renderTree(tree: NodeTree, depth: number = 0): string {
    // Handle INSTANCE_SWAP slot placeholders — render as {propName}
    if (tree.isSlot) {
      if (tree.condition) {
        return `{${tree.condition} && ${tree.component}}`
      }
      return `{${tree.component}}`
    }

    // Render the core JSX
    let result: string
    if (tree.textChildren && tree.textChildren.length > 0) {
      result = renderNode(tree.component, tree.props, depth, tree.textChildren)
    } else {
      const childrenCodes: string[] = []
      for (const child of tree.children) {
        childrenCodes.push(Codegen.renderTree(child, 0))
      }
      result = renderNode(tree.component, tree.props, depth, childrenCodes)
    }

    // Wrap with BOOLEAN conditional rendering if needed
    if (tree.condition) {
      if (result.includes('\n')) {
        return `{${tree.condition} && (\n${paddingLeftMultiline(result, 1)}\n)}`
      }
      return `{${tree.condition} && ${result}}`
    }

    return result
  }
}
