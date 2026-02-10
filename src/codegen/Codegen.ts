import { getComponentName } from '../utils'
import { getProps } from './props'
import { getPositionProps } from './props/position'
import { getSelectorProps, sanitizePropertyName } from './props/selector'
import { getTransformProps } from './props/transform'
import { renderComponent, renderNode } from './render'
import { renderText } from './render/text'
import type { ComponentTree, NodeTree } from './types'
import { checkAssetNode } from './utils/check-asset-node'
import { checkSameColor } from './utils/check-same-color'
import { extractInstanceVariantProps } from './utils/extract-instance-variant-props'
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
    { node: SceneNode; code: string; variants: Record<string, string> }
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
  private pendingComponentTrees: Promise<void>[] = []

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

  getComponentsCodes() {
    const result: Array<readonly [string, string]> = []
    for (const { node, code, variants } of this.components.values()) {
      const name = getComponentName(node)
      result.push([name, renderComponent(name, code, variants)])
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

    // Await all fire-and-forget addComponentTree calls before rendering
    if (this.pendingComponentTrees.length > 0) {
      await Promise.all(this.pendingComponentTrees)
      this.pendingComponentTrees = []
    }

    // Sync componentTrees to components
    for (const [compId, compTree] of this.componentTrees) {
      if (!this.components.has(compId)) {
        this.components.set(compId, {
          node: compTree.node,
          code: Codegen.renderTree(compTree.tree, 0),
          variants: compTree.variants,
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
    // When called as the root-level buildTree (node === this.node),
    // drain any fire-and-forget addComponentTree promises so that
    // getComponentTrees() is populated before the caller inspects it.
    if (node === this.node && this.pendingComponentTrees.length > 0) {
      await Promise.all(this.pendingComponentTrees)
      this.pendingComponentTrees = []
    }
    return result
  }

  private async doBuildTree(node: SceneNode): Promise<NodeTree> {
    const tBuild = perfStart()
    // Handle asset nodes (images/SVGs)
    const assetNode = checkAssetNode(node)
    if (assetNode) {
      const props = await getProps(node)
      props.src = `/${assetNode === 'svg' ? 'icons' : 'images'}/${node.name}.${assetNode}`
      if (assetNode === 'svg') {
        const maskColor = await checkSameColor(node)
        if (maskColor) {
          props.maskImage = buildCssUrl(props.src as string)
          props.maskRepeat = 'no-repeat'
          props.maskSize = 'contain'
          props.bg = maskColor
          delete props.src
        }
      }
      perfEnd('buildTree()', tBuild)
      return {
        component: 'src' in props ? 'Image' : 'Box',
        props,
        children: [],
        nodeType: node.type,
        nodeName: node.name,
      }
    }

    // Handle INSTANCE nodes first — they only need position props (all sync),
    // skipping the expensive full getProps() with 6 async Figma API calls.
    if (node.type === 'INSTANCE') {
      const mainComponent = await getMainComponentCached(node)
      // Fire addComponentTree without awaiting — it runs in the background.
      // All pending promises are collected and awaited in run() before rendering.
      if (mainComponent) {
        this.pendingComponentTrees.push(this.addComponentTree(mainComponent))
      }

      const componentName = getComponentName(mainComponent || node)
      const variantProps = extractInstanceVariantProps(node)

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
              children: [],
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
        children: [],
        nodeType: node.type,
        nodeName: node.name,
        isComponent: true,
      }
    }

    // Fire getProps early for non-INSTANCE nodes — it runs while we process children.
    const propsPromise = getProps(node)

    // Handle COMPONENT_SET or COMPONENT - add to componentTrees (fire-and-forget)
    if (
      (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') &&
      ((this.node.type === 'COMPONENT_SET' &&
        node === this.node.defaultVariant) ||
        this.node.type === 'COMPONENT')
    ) {
      this.pendingComponentTrees.push(
        this.addComponentTree(
          node.type === 'COMPONENT_SET' ? node.defaultVariant : node,
        ),
      )
    }

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
      // Await any fire-and-forget addComponentTree calls launched during buildTree
      if (this.pendingComponentTrees.length > 0) {
        await Promise.all(this.pendingComponentTrees)
        this.pendingComponentTrees = []
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

  private async addComponentTree(node: ComponentNode): Promise<void> {
    const nodeId = node.id || node.name
    if (this.componentTrees.has(nodeId)) return

    // If already in-flight, await the same promise
    const inflight = this.addComponentTreePromises.get(nodeId)
    if (inflight) return inflight

    const promise = this.doAddComponentTree(node, nodeId)
    this.addComponentTreePromises.set(nodeId, promise)
    return promise
  }

  private async doAddComponentTree(
    node: ComponentNode,
    nodeId: string,
  ): Promise<void> {
    const tAdd = perfStart()

    // Fire getProps + getSelectorProps early (2 independent API calls)
    const propsPromise = getProps(node)
    const t = perfStart()
    const selectorPropsPromise = getSelectorProps(node)

    // Collect INSTANCE_SWAP and BOOLEAN property definitions for slot/condition detection.
    const parentSet = node.parent?.type === 'COMPONENT_SET' ? node.parent : null
    const propDefs =
      parentSet?.componentPropertyDefinitions ||
      node.componentPropertyDefinitions ||
      {}
    const instanceSwapSlots = new Map<string, string>()
    const booleanSlots = new Map<string, string>()
    for (const [key, def] of Object.entries(propDefs)) {
      if (def.type === 'INSTANCE_SWAP') {
        instanceSwapSlots.set(key, sanitizePropertyName(key))
      } else if (def.type === 'BOOLEAN') {
        booleanSlots.set(key, sanitizePropertyName(key))
      }
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
    })
    perfEnd('addComponentTree()', tAdd)
  }

  /**
   * Check if the node is a COMPONENT_SET with viewport variant.
   */
  hasViewportVariant(): boolean {
    if (this.node.type !== 'COMPONENT_SET') return false
    for (const key in (this.node as ComponentSetNode)
      .componentPropertyDefinitions) {
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
      const childrenCodes = tree.children.map((child) =>
        Codegen.renderTree(child, 0),
      )
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
