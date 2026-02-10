import { Codegen } from '../Codegen'
import {
  getSelectorPropsForGroup,
  sanitizePropertyName,
} from '../props/selector'
import { renderComponent, renderNode } from '../render'
import type { NodeTree, Props } from '../types'
import { paddingLeftMultiline } from '../utils/padding-left-multiline'
import { perfEnd, perfStart } from '../utils/perf'
import {
  BREAKPOINT_ORDER,
  type BreakpointKey,
  createVariantPropValue,
  getBreakpointByWidth,
  mergePropsToResponsive,
  mergePropsToVariant,
  optimizeResponsiveValue,
  type PropValue,
  viewportToBreakpoint,
} from '.'

function firstMapValue<V>(map: Map<unknown, V>): V {
  for (const v of map.values()) return v
  throw new Error('empty map')
}

function firstMapKey<K>(map: Map<K, unknown>): K {
  for (const k of map.keys()) return k
  throw new Error('empty map')
}

function firstMapEntry<K, V>(map: Map<K, V>): [K, V] {
  for (const entry of map.entries()) return entry
  throw new Error('empty map')
}

/**
 * Generate responsive code by merging children inside a Section.
 * Uses Codegen to build NodeTree for each breakpoint, then merges them.
 */
export class ResponsiveCodegen {
  private breakpointNodes: Map<BreakpointKey, SceneNode> = new Map()

  constructor(private sectionNode: SectionNode | null) {
    if (this.sectionNode) {
      this.categorizeChildren()
    }
  }

  /**
   * Group Section children by width to decide breakpoints.
   */
  private categorizeChildren() {
    if (!this.sectionNode) return
    for (const child of this.sectionNode.children) {
      if ('width' in child) {
        const breakpoint = getBreakpointByWidth(child.width)
        // If multiple nodes share a breakpoint, keep the first.
        if (!this.breakpointNodes.has(breakpoint)) {
          this.breakpointNodes.set(breakpoint, child)
        }
      }
    }
  }

  /**
   * Generate responsive code.
   */
  async generateResponsiveCode(): Promise<string> {
    if (this.breakpointNodes.size === 0) {
      return '// No responsive variants found in section'
    }

    if (this.breakpointNodes.size === 1) {
      // If only one breakpoint, generate normal code using Codegen.
      const [, node] = firstMapEntry(this.breakpointNodes)
      const codegen = new Codegen(node)
      const tree = await codegen.getTree()
      return Codegen.renderTree(tree, 0)
    }

    // Extract trees per breakpoint using Codegen — all independent, run in parallel.
    const breakpointEntries = [...this.breakpointNodes.entries()]
    const treeResults: Array<readonly [BreakpointKey, NodeTree]> = []
    for (const [bp, node] of breakpointEntries) {
      const codegen = new Codegen(node)
      const tree = await codegen.getTree()
      treeResults.push([bp, tree] as const)
    }
    const breakpointTrees = new Map<BreakpointKey, NodeTree>(treeResults)

    // Merge trees and generate code.
    return this.generateMergedCode(breakpointTrees, 0)
  }

  /**
   * Convert NodeTree children array to Map by nodeName.
   */
  private treeChildrenToMap(tree: NodeTree): Map<string, NodeTree[]> {
    const result = new Map<string, NodeTree[]>()
    for (const child of tree.children) {
      const existing = result.get(child.nodeName) || []
      existing.push(child)
      result.set(child.nodeName, existing)
    }
    return result
  }

  /**
   * Generate merged responsive code from NodeTree objects.
   */
  generateMergedCode(
    treesByBreakpoint: Map<BreakpointKey, NodeTree>,
    depth: number,
  ): string {
    const firstTree = firstMapValue(treesByBreakpoint)

    // If node is INSTANCE or COMPONENT, render as component reference
    if (firstTree.isComponent) {
      // Position props that may need responsive merging
      const positionPropKeys = [
        'pos',
        'top',
        'left',
        'right',
        'bottom',
        'display',
      ]

      // Reserved variant keys that should not be passed as props (internal use only)
      const reservedVariantKeys = ['effect', 'viewport']

      // For components, we might still need position props
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        const posProps: Props = {}
        if (tree.props.pos) posProps.pos = tree.props.pos
        if (tree.props.top) posProps.top = tree.props.top
        if (tree.props.left) posProps.left = tree.props.left
        if (tree.props.right) posProps.right = tree.props.right
        if (tree.props.bottom) posProps.bottom = tree.props.bottom
        if (tree.props.display) posProps.display = tree.props.display
        propsMap.set(bp, posProps)
      }
      const mergedPositionProps = mergePropsToResponsive(propsMap)

      // Extract variant props (non-position props) - these are Instance variant values
      // They should be the same across breakpoints, so just use firstTree
      // Filter out reserved variant keys (effect, viewport) which are used internally
      const variantProps: Props = {}
      for (const [key, value] of Object.entries(firstTree.props)) {
        const lowerKey = key.toLowerCase()
        const isPositionProp = positionPropKeys.includes(key)
        const isReservedVariant = reservedVariantKeys.some(
          (r) => lowerKey === r,
        )
        if (!isPositionProp && !isReservedVariant) {
          variantProps[key] = value
        }
      }

      // If component has position props, wrap in Box
      if (Object.keys(mergedPositionProps).length > 0) {
        const componentCode = renderNode(
          firstTree.component,
          variantProps,
          0,
          [],
        )
        return renderNode('Box', mergedPositionProps, depth, [componentCode])
      }

      return renderNode(firstTree.component, variantProps, depth, [])
    }

    // Handle WRAPPER nodes (position wrapper for components)
    if (firstTree.nodeType === 'WRAPPER') {
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // Recursively merge the inner component
      const innerTrees = new Map<BreakpointKey, NodeTree>()
      for (const [bp, tree] of treesByBreakpoint) {
        if (tree.children.length > 0) {
          innerTrees.set(bp, tree.children[0])
        }
      }

      const innerCode =
        innerTrees.size > 0 ? this.generateMergedCode(innerTrees, 0) : ''

      return renderNode('Box', mergedProps, depth, innerCode ? [innerCode] : [])
    }

    // Merge props across breakpoints
    const propsMap = new Map<BreakpointKey, Props>()
    for (const [bp, tree] of treesByBreakpoint) {
      propsMap.set(bp, tree.props)
    }
    const mergedProps = mergePropsToResponsive(propsMap)

    // Handle TEXT nodes with textChildren
    if (firstTree.textChildren && firstTree.textChildren.length > 0) {
      // Merge text children across breakpoints
      const mergedTextChildren =
        this.mergeTextChildrenAcrossBreakpoints(treesByBreakpoint)
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        mergedTextChildren,
      )
    }

    // Merge children by name
    const childrenCodes: string[] = []
    const processedChildNames = new Set<string>()

    // Convert all trees' children to maps
    const childrenMaps = new Map<BreakpointKey, Map<string, NodeTree[]>>()
    for (const [bp, tree] of treesByBreakpoint) {
      childrenMaps.set(bp, this.treeChildrenToMap(tree))
    }

    // Get all child names in order (first tree's order, then others)
    const firstBreakpoint = firstMapKey(treesByBreakpoint)
    const firstChildrenMap = childrenMaps.get(firstBreakpoint)
    const allChildNames: string[] = []

    if (firstChildrenMap) {
      for (const name of firstChildrenMap.keys()) {
        allChildNames.push(name)
        processedChildNames.add(name)
      }
    }

    // Add children that exist only in other breakpoints
    for (const childMap of childrenMaps.values()) {
      for (const name of childMap.keys()) {
        if (!processedChildNames.has(name)) {
          allChildNames.push(name)
          processedChildNames.add(name)
        }
      }
    }

    for (const childName of allChildNames) {
      // Find the maximum number of children with this name across all breakpoints
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      // Process each child index separately
      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByBreakpoint = new Map<BreakpointKey, NodeTree>()
        const presentBreakpoints = new Set<BreakpointKey>()

        for (const [bp, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByBreakpoint.set(bp, children[childIndex])
            presentBreakpoints.add(bp)
          }
        }

        if (childByBreakpoint.size > 0) {
          // Add display:none props for breakpoints where child doesn't exist
          // This handles both:
          // 1. Child exists only in mobile (needs display:none in pc)
          // 2. Child exists only in pc (needs display:none in mobile)
          for (const bp of treesByBreakpoint.keys()) {
            if (!presentBreakpoints.has(bp)) {
              const firstChildTree = firstMapValue(childByBreakpoint)
              const hiddenTree: NodeTree = {
                ...firstChildTree,
                props: { ...firstChildTree.props, display: 'none' },
              }
              childByBreakpoint.set(bp, hiddenTree)
            }
          }

          const childCode = this.generateMergedCode(childByBreakpoint, 0)
          childrenCodes.push(childCode)
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }

  /**
   * Check if node is Section and can generate responsive.
   */
  static canGenerateResponsive(node: SceneNode): node is SectionNode {
    return node.type === 'SECTION'
  }

  /**
   * Return parent Section if exists.
   */
  static hasParentSection(node: SceneNode): SectionNode | null {
    if (node.parent?.type === 'SECTION') {
      return node.parent as SectionNode
    }
    return null
  }

  /**
   * Generate responsive component codes for COMPONENT_SET with viewport variant.
   * Groups components by non-viewport variants and merges viewport variants.
   */
  static async generateViewportResponsiveComponents(
    componentSet: ComponentSetNode,
    componentName: string,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    // Find viewport variant key
    const viewportKey = Object.keys(
      componentSet.componentPropertyDefinitions,
    ).find((key) => key.toLowerCase() === 'viewport')

    if (!viewportKey) {
      return []
    }

    // Get variants excluding viewport
    const variants: Record<string, string> = {}
    for (const [name, definition] of Object.entries(
      componentSet.componentPropertyDefinitions,
    )) {
      if (name.toLowerCase() !== 'viewport' && definition.type === 'VARIANT') {
        const sanitizedName = sanitizePropertyName(name)
        variants[sanitizedName] =
          definition.variantOptions?.map((opt) => `'${opt}'`).join(' | ') || ''
      }
    }

    // Find effect variant key (to exclude from grouping)
    const effectKey = Object.keys(
      componentSet.componentPropertyDefinitions,
    ).find((key) => key.toLowerCase() === 'effect')

    // Group components by non-viewport, non-effect variants
    const groups = new Map<string, Map<BreakpointKey, ComponentNode>>()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      // Skip non-default effect variants (they become pseudo-selectors)
      if (effectKey && variantProps[effectKey] !== 'default') continue

      const viewportValue = variantProps[viewportKey]
      if (!viewportValue) continue

      const breakpoint = viewportToBreakpoint(viewportValue)
      // Create group key from non-viewport, non-effect variants
      const otherVariants = Object.entries(variantProps)
        .filter(([key]) => {
          const lowerKey = key.toLowerCase()
          return lowerKey !== 'viewport' && lowerKey !== 'effect'
        })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('|')

      const groupKey = otherVariants || '__default__'

      if (!groups.has(groupKey)) {
        groups.set(groupKey, new Map())
      }
      const group = groups.get(groupKey)
      if (group) {
        group.set(breakpoint, component)
      }
    }

    // Generate responsive code for each group
    const results: Array<readonly [string, string]> = []
    const responsiveCodegen = new ResponsiveCodegen(null)

    for (const [groupKey, viewportComponents] of groups) {
      // Parse group key to get variant filter for getSelectorPropsForGroup
      const variantFilter: Record<string, string> = {}
      if (groupKey !== '__default__') {
        for (const part of groupKey.split('|')) {
          const [key, value] = part.split('=')
          // Exclude effect from filter (we want all effect variants for this group)
          if (key.toLowerCase() !== 'effect') {
            variantFilter[key] = value
          }
        }
      }

      // Build trees for each viewport — all independent, run in parallel.
      const viewportEntries = [...viewportComponents.entries()]
      const viewportTreeResults: Array<readonly [BreakpointKey, NodeTree]> = []
      for (const [bp, component] of viewportEntries) {
        let t = perfStart()
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        perfEnd('Codegen.getTree(viewportVariant)', t)

        // Get pseudo-selector props for this specific variant group AND viewport
        // This ensures hover/active colors are correctly responsive per viewport
        if (effectKey) {
          const viewportValue = component.variantProperties?.[viewportKey]
          t = perfStart()
          const selectorProps = await getSelectorPropsForGroup(
            componentSet,
            variantFilter,
            viewportValue,
          )
          perfEnd('getSelectorPropsForGroup(viewport)', t)
          if (Object.keys(selectorProps).length > 0) {
            Object.assign(tree.props, selectorProps)
          }
        }

        viewportTreeResults.push([bp, tree] as const)
      }
      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>(
        viewportTreeResults,
      )

      // Generate merged responsive code
      const mergedCode = responsiveCodegen.generateMergedCode(
        treesByBreakpoint,
        0,
      )

      results.push([
        componentName,
        renderComponent(componentName, mergedCode, variants),
      ] as const)
    }

    return results
  }

  /**
   * Generate component code for COMPONENT_SET with viewport AND other variants.
   * First merges by viewport (responsive arrays), then by other variants (conditional objects).
   *
   * Example output for status variant:
   * - Props: w={{ scroll: [1, 2], default: [3, 4] }[status]}
   * - Conditional nodes: {status === "scroll" && <Node/>}
   */
  static async generateVariantResponsiveComponents(
    componentSet: ComponentSetNode,
    componentName: string,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    console.info(
      `[perf] generateVariantResponsiveComponents: ${componentName}, ${componentSet.children.length} children, ${Object.keys(componentSet.componentPropertyDefinitions).length} variant keys`,
    )
    const tTotal = perfStart()

    // Find viewport variant key
    const viewportKey = Object.keys(
      componentSet.componentPropertyDefinitions,
    ).find((key) => key.toLowerCase() === 'viewport')

    // Find effect variant key
    const effectKey = Object.keys(
      componentSet.componentPropertyDefinitions,
    ).find((key) => key.toLowerCase() === 'effect')

    // Get all variant keys excluding viewport and effect
    const otherVariantKeys: string[] = []
    const variants: Record<string, string> = {}
    // Map from original name to sanitized name
    const variantKeyToSanitized: Record<string, string> = {}
    for (const [name, definition] of Object.entries(
      componentSet.componentPropertyDefinitions,
    )) {
      if (definition.type === 'VARIANT') {
        const lowerName = name.toLowerCase()
        // Exclude both viewport and effect from variant keys
        // viewport is handled by responsive merging
        // effect is handled by getSelectorProps (pseudo-selectors like _hover, _active)
        if (lowerName !== 'viewport' && lowerName !== 'effect') {
          const sanitizedName = sanitizePropertyName(name)
          otherVariantKeys.push(name) // Keep original for Figma data access
          variantKeyToSanitized[name] = sanitizedName
          variants[sanitizedName] =
            definition.variantOptions?.map((opt) => `'${opt}'`).join(' | ') ||
            ''
        }
      }
    }

    // If effect variant only, generate code from defaultVariant with pseudo-selectors
    if (effectKey && !viewportKey && otherVariantKeys.length === 0) {
      const r = await ResponsiveCodegen.generateEffectOnlyComponents(
        componentSet,
        componentName,
      )
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return r
    }

    // If no viewport variant, just handle other variants
    if (!viewportKey) {
      const r = await ResponsiveCodegen.generateNonViewportVariantComponents(
        componentSet,
        componentName,
        otherVariantKeys,
        variants,
      )
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return r
    }

    // If no other variants, use existing viewport-only logic
    if (otherVariantKeys.length === 0) {
      const r = await ResponsiveCodegen.generateViewportResponsiveComponents(
        componentSet,
        componentName,
      )
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return r
    }

    // Handle both viewport and other variants
    // Group by ALL variant keys combined, then by viewport within each group
    // e.g., for size+variant: { "Md|primary" => { "mobile" => Component, "pc" => Component }, ... }

    // Reverse mapping from sanitized to original names
    const sanitizedToOriginal: Record<string, string> = {}
    for (const [original, sanitized] of Object.entries(variantKeyToSanitized)) {
      sanitizedToOriginal[sanitized] = original
    }

    // Sanitized variant keys for code generation
    const sanitizedVariantKeys = otherVariantKeys.map(
      (key) => variantKeyToSanitized[key],
    )

    // Build a composite key from all variant values (using sanitized names)
    const buildCompositeKey = (
      variantProps: Record<string, string>,
    ): string => {
      return otherVariantKeys
        .map((key) => {
          const sanitizedKey = variantKeyToSanitized[key]
          return `${sanitizedKey}=${variantProps[key] || '__default__'}`
        })
        .join('|')
    }

    // Parse composite key to original Figma variant names (for getSelectorPropsForGroup)
    const parseCompositeKeyToOriginal = (
      compositeKey: string,
    ): Record<string, string> => {
      const result: Record<string, string> = {}
      for (const part of compositeKey.split('|')) {
        const [sanitizedKey, value] = part.split('=')
        const originalKey = sanitizedToOriginal[sanitizedKey]
        if (originalKey) {
          result[originalKey] = value
        }
      }
      return result
    }

    const byCompositeVariant = new Map<
      string,
      Map<BreakpointKey, ComponentNode>
    >()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      // Skip effect variants for grouping (they become pseudo-selectors)
      if (effectKey && variantProps[effectKey] !== 'default') continue

      const viewportValue = variantProps[viewportKey]
      if (!viewportValue) continue

      const breakpoint = viewportToBreakpoint(viewportValue)
      const compositeKey = buildCompositeKey(variantProps)

      if (!byCompositeVariant.has(compositeKey)) {
        byCompositeVariant.set(compositeKey, new Map())
      }
      const byBreakpoint = byCompositeVariant.get(compositeKey)
      if (byBreakpoint) {
        byBreakpoint.set(breakpoint, component)
      }
    }

    if (byCompositeVariant.size === 0) {
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return []
    }

    const responsiveCodegen = new ResponsiveCodegen(null)

    // Step 1: For each variant combination, merge by viewport to get responsive props
    const responsivePropsByComposite = new Map<
      string,
      Map<BreakpointKey, NodeTree>
    >()

    // Build trees for all composite variants in parallel — each is independent.
    const compositeEntries = [...byCompositeVariant.entries()]
    const compositeResults: Array<
      readonly [string, Map<BreakpointKey, NodeTree>]
    > = []
    for (const [compositeKey, viewportComponents] of compositeEntries) {
      // Use original names for Figma data access
      const variantFilter = parseCompositeKeyToOriginal(compositeKey)

      // Build trees for each viewport within this composite — also parallel.
      const vpEntries = [...viewportComponents.entries()]
      const vpResults: Array<readonly [BreakpointKey, NodeTree]> = []
      for (const [bp, component] of vpEntries) {
        let t = perfStart()
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        perfEnd('Codegen.getTree(variant)', t)

        // Get pseudo-selector props for this specific variant group AND viewport
        if (effectKey) {
          const viewportValue = component.variantProperties?.[viewportKey]
          t = perfStart()
          const selectorProps = await getSelectorPropsForGroup(
            componentSet,
            variantFilter,
            viewportValue,
          )
          perfEnd('getSelectorPropsForGroup()', t)
          if (Object.keys(selectorProps).length > 0) {
            Object.assign(tree.props, selectorProps)
          }
        }

        vpResults.push([bp, tree] as const)
      }

      compositeResults.push([
        compositeKey,
        new Map<BreakpointKey, NodeTree>(vpResults),
      ] as const)
    }
    for (const [compositeKey, treesByBreakpoint] of compositeResults) {
      responsivePropsByComposite.set(compositeKey, treesByBreakpoint)
    }

    // Step 2: Merge across variant values, handling multiple variant keys
    const mergedCode = responsiveCodegen.generateMultiVariantMergedCode(
      sanitizedVariantKeys,
      responsivePropsByComposite,
      0,
    )

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, mergedCode, variants)],
    ]
    return result
  }

  /**
   * Generate component code for COMPONENT_SET with effect variant only (no other variants).
   * Uses defaultVariant as the base and adds pseudo-selector props from getSelectorProps.
   */
  private static async generateEffectOnlyComponents(
    componentSet: ComponentSetNode,
    componentName: string,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    // Use defaultVariant as the base component
    const defaultComponent = componentSet.defaultVariant
    if (!defaultComponent) {
      return []
    }

    // Get base props from defaultVariant
    const codegen = new Codegen(defaultComponent)
    const tree = await codegen.getTree()

    // Get pseudo-selector props (hover, active, disabled, etc.)
    const selectorProps = await getSelectorPropsForGroup(componentSet, {})
    if (Object.keys(selectorProps).length > 0) {
      Object.assign(tree.props, selectorProps)
    }

    // Render the tree to JSX
    const code = Codegen.renderTree(tree, 0)

    // No variant props needed since effect is handled via pseudo-selectors
    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, code, {})],
    ]
    return result
  }

  /**
   * Generate component code for COMPONENT_SET with non-viewport variants only.
   */
  private static async generateNonViewportVariantComponents(
    componentSet: ComponentSetNode,
    componentName: string,
    variantKeys: string[],
    variants: Record<string, string>,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    if (variantKeys.length === 0) {
      return []
    }

    // Group components by variant value
    const primaryVariantKey = variantKeys[0]
    const componentsByVariant = new Map<string, ComponentNode>()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}
      const variantValue = variantProps[primaryVariantKey] || '__default__'

      if (!componentsByVariant.has(variantValue)) {
        componentsByVariant.set(variantValue, component)
      }
    }

    // Check if componentSet has effect variant (pseudo-selector)
    const hasEffect = Object.keys(
      componentSet.componentPropertyDefinitions,
    ).some((key) => key.toLowerCase() === 'effect')

    // Build trees for each variant — all independent, run in parallel.
    const variantEntries = [...componentsByVariant.entries()]
    const variantResults: Array<readonly [string, NodeTree]> = []
    for (const [variantValue, component] of variantEntries) {
      // Get pseudo-selector props for this specific variant group
      const variantFilter: Record<string, string> = {
        [primaryVariantKey]: variantValue,
      }
      let t = perfStart()
      const selectorProps = hasEffect
        ? await getSelectorPropsForGroup(componentSet, variantFilter)
        : null
      perfEnd('getSelectorPropsForGroup(nonViewport)', t)

      t = perfStart()
      const codegen = new Codegen(component)
      const tree = await codegen.getTree()
      perfEnd('Codegen.getTree(nonViewportVariant)', t)
      // Add pseudo-selector props to tree
      if (selectorProps && Object.keys(selectorProps).length > 0) {
        Object.assign(tree.props, selectorProps)
      }
      variantResults.push([variantValue, tree] as const)
    }
    const treesByVariant = new Map<string, NodeTree>(variantResults)

    // Generate merged code with variant conditionals
    const responsiveCodegen = new ResponsiveCodegen(null)
    // Use sanitized variant key for code generation (e.g., "속성 1" -> "property1")
    const sanitizedPrimaryVariantKey = sanitizePropertyName(primaryVariantKey)
    const mergedCode = responsiveCodegen.generateVariantOnlyMergedCode(
      sanitizedPrimaryVariantKey,
      treesByVariant,
      0,
    )

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, mergedCode, variants)],
    ]
    return result
  }

  /**
   * Generate merged code from NodeTree objects across both viewport and variant dimensions.
   * First applies responsive merging per variant, then variant conditional merging.
   */
  generateVariantMergedCode(
    variantKey: string,
    treesByVariantAndBreakpoint: Map<string, Map<BreakpointKey, NodeTree>>,
    depth: number,
  ): string {
    // First, for each variant value, merge across breakpoints
    const mergedTreesByVariant = new Map<string, NodeTree>()

    for (const [
      variantValue,
      treesByBreakpoint,
    ] of treesByVariantAndBreakpoint) {
      const firstTree = firstMapValue(treesByBreakpoint)
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // Also merge children recursively
      const mergedChildren =
        this.mergeChildrenAcrossBreakpoints(treesByBreakpoint)

      mergedTreesByVariant.set(variantValue, {
        ...firstTree,
        props: mergedProps,
        children: mergedChildren,
      })
    }

    // Then merge across variant values
    return this.generateVariantOnlyMergedCode(
      variantKey,
      mergedTreesByVariant,
      depth,
    )
  }

  /**
   * Merge children across breakpoints for a single variant value.
   */
  private mergeChildrenAcrossBreakpoints(
    treesByBreakpoint: Map<BreakpointKey, NodeTree>,
  ): NodeTree[] {
    const childrenMaps = new Map<BreakpointKey, Map<string, NodeTree[]>>()
    for (const [bp, tree] of treesByBreakpoint) {
      childrenMaps.set(bp, this.treeChildrenToMap(tree))
    }

    const processedChildNames = new Set<string>()
    const allChildNames: string[] = []
    const firstBreakpoint = firstMapKey(treesByBreakpoint)
    const firstChildrenMap = childrenMaps.get(firstBreakpoint)

    if (firstChildrenMap) {
      for (const name of firstChildrenMap.keys()) {
        allChildNames.push(name)
        processedChildNames.add(name)
      }
    }

    for (const childMap of childrenMaps.values()) {
      for (const name of childMap.keys()) {
        if (!processedChildNames.has(name)) {
          allChildNames.push(name)
          processedChildNames.add(name)
        }
      }
    }

    const mergedChildren: NodeTree[] = []

    for (const childName of allChildNames) {
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByBreakpoint = new Map<BreakpointKey, NodeTree>()
        const presentBreakpoints = new Set<BreakpointKey>()

        for (const [bp, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByBreakpoint.set(bp, children[childIndex])
            presentBreakpoints.add(bp)
          }
        }

        if (childByBreakpoint.size > 0) {
          for (const bp of treesByBreakpoint.keys()) {
            if (!presentBreakpoints.has(bp)) {
              const firstChildTree = firstMapValue(childByBreakpoint)
              const hiddenTree: NodeTree = {
                ...firstChildTree,
                props: { ...firstChildTree.props, display: 'none' },
              }
              childByBreakpoint.set(bp, hiddenTree)
            }
          }

          // Merge this child's props across breakpoints
          const firstChildTree = firstMapValue(childByBreakpoint)
          const propsMap = new Map<BreakpointKey, Props>()
          for (const [bp, tree] of childByBreakpoint) {
            propsMap.set(bp, tree.props)
          }
          const mergedProps = mergePropsToResponsive(propsMap)

          // Recursively merge grandchildren
          const grandchildren =
            this.mergeChildrenAcrossBreakpoints(childByBreakpoint)

          mergedChildren.push({
            ...firstChildTree,
            props: mergedProps,
            children: grandchildren,
          })
        }
      }
    }

    return mergedChildren
  }

  /**
   * Generate merged code from NodeTree objects across variant values only (no viewport).
   * Creates conditional props: { scroll: [...], default: [...] }[status]
   * And conditional nodes: {status === "scroll" && <Node/>}
   */
  generateVariantOnlyMergedCode(
    variantKey: string,
    treesByVariant: Map<string, NodeTree>,
    depth: number,
  ): string {
    const firstTree = firstMapValue(treesByVariant)
    const allVariants = [...treesByVariant.keys()]

    // Merge props across variants
    const propsMap = new Map<string, Record<string, unknown>>()
    for (const [variant, tree] of treesByVariant) {
      propsMap.set(variant, tree.props)
    }
    const mergedProps = mergePropsToVariant(variantKey, propsMap)

    // Handle TEXT nodes
    if (firstTree.textChildren && firstTree.textChildren.length > 0) {
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        firstTree.textChildren,
      )
    }

    // Merge children across variants
    const childrenCodes: string[] = []
    const childrenMaps = new Map<string, Map<string, NodeTree[]>>()
    for (const [variant, tree] of treesByVariant) {
      childrenMaps.set(variant, this.treeChildrenToMap(tree))
    }

    const processedChildNames = new Set<string>()
    const allChildNames: string[] = []
    const firstVariant = firstMapKey(treesByVariant)
    const firstChildrenMap = childrenMaps.get(firstVariant)

    if (firstChildrenMap) {
      for (const name of firstChildrenMap.keys()) {
        allChildNames.push(name)
        processedChildNames.add(name)
      }
    }

    for (const childMap of childrenMaps.values()) {
      for (const name of childMap.keys()) {
        if (!processedChildNames.has(name)) {
          allChildNames.push(name)
          processedChildNames.add(name)
        }
      }
    }

    for (const childName of allChildNames) {
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByVariant = new Map<string, NodeTree>()
        const presentVariants = new Set<string>()

        for (const [variant, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByVariant.set(variant, children[childIndex])
            presentVariants.add(variant)
          }
        }

        if (childByVariant.size > 0) {
          // Check if child exists in all variants or only some
          const existsInAllVariants = allVariants.every((v) =>
            presentVariants.has(v),
          )

          if (existsInAllVariants) {
            // Child exists in all variants - merge props
            const childCode = this.generateVariantOnlyMergedCode(
              variantKey,
              childByVariant,
              0,
            )
            childrenCodes.push(childCode)
          } else {
            // Child exists only in some variants - use conditional rendering
            const presentVariantsList = [...presentVariants]

            if (presentVariantsList.length === 1) {
              // Only one variant has this child: {status === "scroll" && <Node/>}
              const onlyVariant = presentVariantsList[0]
              const childTree = childByVariant.get(onlyVariant)
              if (!childTree) continue
              const childCode = Codegen.renderTree(childTree, 0)
              const formattedChildCode = childCode.includes('\n')
                ? `(\n${paddingLeftMultiline(childCode, 1)}\n)`
                : childCode
              childrenCodes.push(
                `{${variantKey} === "${onlyVariant}" && ${formattedChildCode}}`,
              )
            } else {
              // Multiple (but not all) variants have this child
              // Use conditional rendering with OR
              const conditions = presentVariantsList
                .map((v) => `${variantKey} === "${v}"`)
                .join(' || ')
              const childCode = this.generateVariantOnlyMergedCode(
                variantKey,
                childByVariant,
                0,
              )
              const formattedChildCode = childCode.includes('\n')
                ? `2(\n${paddingLeftMultiline(childCode, 1)}\n)`
                : childCode
              childrenCodes.push(`{(${conditions}) && ${formattedChildCode}}`)
            }
          }
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }

  /**
   * Generate merged code from NodeTree objects across multiple variant dimensions and viewport.
   * Handles composite keys like "size=Md|variant=primary" and produces nested variant conditionals.
   *
   * For props that differ:
   * - Across viewport only: responsive array ["mobile", null, null, null, "desktop"]
   * - Across one variant only: { Md: "value1", Sm: "value2" }[size]
   * - Across both: { Md: ["mobile", null, null, null, "desktop"], Sm: "fixed" }[size]
   * - Across multiple variants: nested conditionals or combined
   */
  generateMultiVariantMergedCode(
    variantKeys: string[],
    treesByCompositeAndBreakpoint: Map<string, Map<BreakpointKey, NodeTree>>,
    depth: number,
  ): string {
    // First, for each composite variant, merge across breakpoints
    const mergedTreesByComposite = new Map<string, NodeTree>()

    for (const [
      compositeKey,
      treesByBreakpoint,
    ] of treesByCompositeAndBreakpoint) {
      const firstTree = firstMapValue(treesByBreakpoint)
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // Also merge children recursively
      const mergedChildren =
        this.mergeChildrenAcrossBreakpoints(treesByBreakpoint)

      mergedTreesByComposite.set(compositeKey, {
        ...firstTree,
        props: mergedProps,
        children: mergedChildren,
      })
    }

    // Now merge across all variant dimensions
    // We'll process each variant key in sequence, merging values
    return this.generateNestedVariantMergedCode(
      variantKeys,
      mergedTreesByComposite,
      depth,
    )
  }

  /**
   * Generate merged code with nested variant conditionals.
   * For multiple variant keys, this creates props like:
   * { primary: { Md: [...], Sm: [...] }[size], white: { Md: [...], Sm: [...] }[size] }[variant]
   */
  private generateNestedVariantMergedCode(
    variantKeys: string[],
    treesByComposite: Map<string, NodeTree>,
    depth: number,
  ): string {
    const firstTree = firstMapValue(treesByComposite)

    // Build props map indexed by composite key
    const propsMap = new Map<string, Record<string, unknown>>()
    for (const [compositeKey, tree] of treesByComposite) {
      propsMap.set(compositeKey, tree.props)
    }

    // Merge props across all composite variants
    const mergedProps = this.mergePropsAcrossComposites(variantKeys, propsMap)

    // Handle TEXT nodes
    if (firstTree.textChildren && firstTree.textChildren.length > 0) {
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        firstTree.textChildren,
      )
    }

    // For children, we need to merge across all composite variants
    const childrenCodes: string[] = []

    // Build children maps for each composite variant
    const childrenMaps = new Map<string, Map<string, NodeTree[]>>()
    for (const [compositeKey, tree] of treesByComposite) {
      childrenMaps.set(compositeKey, this.treeChildrenToMap(tree))
    }

    // Get all unique child names
    const processedChildNames = new Set<string>()
    const allChildNames: string[] = []
    const firstComposite = firstMapKey(treesByComposite)
    const firstChildrenMap = childrenMaps.get(firstComposite)

    if (firstChildrenMap) {
      for (const name of firstChildrenMap.keys()) {
        allChildNames.push(name)
        processedChildNames.add(name)
      }
    }

    for (const childMap of childrenMaps.values()) {
      for (const name of childMap.keys()) {
        if (!processedChildNames.has(name)) {
          allChildNames.push(name)
          processedChildNames.add(name)
        }
      }
    }

    // Process each child
    const allCompositeKeys = [...treesByComposite.keys()]

    for (const childName of allChildNames) {
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByComposite = new Map<string, NodeTree>()
        const presentComposites = new Set<string>()

        for (const [compositeKey, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByComposite.set(compositeKey, children[childIndex])
            presentComposites.add(compositeKey)
          }
        }

        if (childByComposite.size > 0) {
          const existsInAll = allCompositeKeys.every((k) =>
            presentComposites.has(k),
          )

          if (existsInAll) {
            // Child exists in all variants - recursively merge
            const childCode = this.generateNestedVariantMergedCode(
              variantKeys,
              childByComposite,
              0,
            )
            childrenCodes.push(childCode)
          } else {
            // Child exists only in some variants - use first one for now
            // TODO: implement conditional rendering for partial children
            const firstChildTree = firstMapValue(childByComposite)
            const childCode = Codegen.renderTree(firstChildTree, 0)
            childrenCodes.push(childCode)
          }
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }

  /**
   * Merge props across composite variant keys.
   * Creates nested variant conditionals for props that differ.
   */
  private mergePropsAcrossComposites(
    variantKeys: string[],
    propsMap: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    // Collect all prop keys
    const allPropKeys = new Set<string>()
    for (const props of propsMap.values()) {
      for (const key of Object.keys(props)) {
        allPropKeys.add(key)
      }
    }

    // For each prop, determine how to merge it
    for (const propKey of allPropKeys) {
      // Check if prop is a pseudo-selector (needs special handling)
      if (propKey.startsWith('_')) {
        // Collect pseudo-selector props across all composites
        // For composites that don't have this pseudo-selector, use empty object
        // so that inner props get null values for those composites
        const pseudoPropsMap = new Map<string, Record<string, unknown>>()
        let hasPseudoSelector = false
        for (const [compositeKey, props] of propsMap) {
          if (
            propKey in props &&
            typeof props[propKey] === 'object' &&
            props[propKey] !== null
          ) {
            pseudoPropsMap.set(
              compositeKey,
              props[propKey] as Record<string, unknown>,
            )
            hasPseudoSelector = true
          } else {
            // Composite doesn't have this pseudo-selector, use empty object
            // This ensures inner props get null for this composite
            pseudoPropsMap.set(compositeKey, {})
          }
        }
        if (hasPseudoSelector) {
          result[propKey] = this.mergePropsAcrossComposites(
            variantKeys,
            pseudoPropsMap,
          )
        }
        continue
      }

      // Collect values for this prop across all composites
      // For composites that don't have this prop, use null
      const valuesByComposite = new Map<string, unknown>()
      let hasValue = false
      for (const [compositeKey, props] of propsMap) {
        if (propKey in props) {
          valuesByComposite.set(compositeKey, props[propKey])
          hasValue = true
        } else {
          // Composite doesn't have this prop, use null
          valuesByComposite.set(compositeKey, null)
        }
      }

      if (!hasValue) continue

      // Check if all values are the same (including null checks)
      const uniqueValues = new Set<string>()
      for (const value of valuesByComposite.values()) {
        uniqueValues.add(JSON.stringify(value))
      }

      const firstValue = firstMapValue(valuesByComposite)
      if (uniqueValues.size === 1 && firstValue !== null) {
        // All values are the same and not null - use as-is
        result[propKey] = firstValue
      } else {
        // Values differ or some are null - need to create variant conditional
        // Filter out null values for the conditional (only include composites that have the prop)
        const nonNullValues = new Map<string, unknown>()
        for (const [compositeKey, value] of valuesByComposite) {
          if (value !== null) {
            nonNullValues.set(compositeKey, value)
          }
        }

        if (nonNullValues.size > 0) {
          // Try to find which variant key causes the difference
          result[propKey] = this.createNestedVariantProp(
            variantKeys,
            nonNullValues,
          )
        }
      }
    }

    return result
  }

  /**
   * Create a nested variant prop value for props that differ across multiple variant dimensions.
   * Optimized to minimize nesting depth by choosing the best outer variant key.
   */
  private createNestedVariantProp(
    variantKeys: string[],
    valuesByComposite: Map<string, unknown>,
  ): unknown {
    // Parse composite keys
    const parseCompositeKey = (
      compositeKey: string,
    ): Record<string, string> => {
      const parsed: Record<string, string> = {}
      for (const part of compositeKey.split('|')) {
        const [key, value] = part.split('=')
        parsed[key] = value
      }
      return parsed
    }

    // If only one variant key, create simple conditional
    if (variantKeys.length === 1) {
      const variantKey = variantKeys[0]
      const valuesByVariant: Record<string, unknown> = {}

      for (const [compositeKey, value] of valuesByComposite) {
        const parsed = parseCompositeKey(compositeKey)
        const variantValue = parsed[variantKey]
        valuesByVariant[variantValue] = value
      }

      // Check if all values are the same
      const uniqueValues = new Set(
        Object.values(valuesByVariant).map((v) => JSON.stringify(v)),
      )
      if (uniqueValues.size === 1) {
        return Object.values(valuesByVariant)[0]
      }

      return createVariantPropValue(
        variantKey,
        valuesByVariant as Record<string, PropValue>,
      )
    }

    // For multiple variant keys, calculate nesting cost for each possible outer key
    // and choose the one with minimum cost
    interface CandidateResult {
      variantKey: string
      cost: number
      nestedValues: Record<string, unknown>
    }

    const candidates: CandidateResult[] = []

    for (const variantKey of variantKeys) {
      const valuesByVariant = new Map<string, Map<string, unknown>>()

      for (const [compositeKey, value] of valuesByComposite) {
        const parsed = parseCompositeKey(compositeKey)
        const variantValue = parsed[variantKey]

        if (!valuesByVariant.has(variantValue)) {
          valuesByVariant.set(variantValue, new Map())
        }
        // Build a sub-composite key without this variant
        const subCompositeKey = variantKeys
          .filter((k) => k !== variantKey)
          .map((k) => `${k}=${parsed[k]}`)
          .join('|')
        const variantMap = valuesByVariant.get(variantValue)
        if (variantMap) {
          variantMap.set(subCompositeKey, value)
        }
      }

      // Calculate nested values and cost for this outer key
      const remainingKeys = variantKeys.filter((k) => k !== variantKey)
      const nestedValues: Record<string, unknown> = {}
      let totalCost = 0

      for (const [variantValue, subValues] of valuesByVariant) {
        // Check if all sub-values are the same (can collapse to scalar)
        const uniqueSubValues = new Set(
          [...subValues.values()].map((v) => JSON.stringify(v)),
        )

        if (uniqueSubValues.size === 1) {
          // All same - collapse to scalar value (cost 0)
          nestedValues[variantValue] = firstMapValue(subValues)
          // Cost is 0 for scalar
        } else {
          // Need to recurse
          const nestedResult = this.createNestedVariantProp(
            remainingKeys,
            subValues,
          )
          nestedValues[variantValue] = nestedResult

          // Calculate cost based on nesting depth
          totalCost += this.calculateNestingCost(nestedResult)
        }
      }

      // Add the number of entries as a secondary cost factor
      // This ensures we prefer fewer entries when nesting costs are equal
      // Multiply by 0.1 to make it a tiebreaker (less important than nesting depth)
      const entryCost = Object.keys(nestedValues).length * 0.1

      candidates.push({
        variantKey,
        cost: totalCost + entryCost,
        nestedValues,
      })
    }

    // Find the candidate with minimum cost
    let bestCandidate = candidates[0]
    for (const candidate of candidates) {
      if (candidate.cost < bestCandidate.cost) {
        bestCandidate = candidate
      }
    }

    return createVariantPropValue(
      bestCandidate.variantKey,
      bestCandidate.nestedValues as Record<string, PropValue>,
    )
  }

  /**
   * Calculate the nesting cost of a value.
   * Scalar values have cost 0, VariantPropValue adds 1 + cost of nested values.
   */
  private calculateNestingCost(value: unknown): number {
    if (
      typeof value === 'object' &&
      value !== null &&
      '__variantProp' in value
    ) {
      const variantProp = value as {
        __variantProp: true
        values: Record<string, unknown>
      }
      let maxNestedCost = 0
      for (const nestedValue of Object.values(variantProp.values)) {
        const nestedCost = this.calculateNestingCost(nestedValue)
        maxNestedCost = Math.max(maxNestedCost, nestedCost)
      }
      return 1 + maxNestedCost
    }
    return 0
  }

  /**
   * Merge text children across breakpoints.
   * Compares text content and handles \n differences with responsive <br /> display.
   *
   * Example:
   * - PC: "안녕하세요 반갑습니다"
   * - Mobile: "안녕하세요\n반갑습니다"
   * Result: "안녕하세요<Box as="br" display={[null, null, null, null, 'none']} />반갑습니다"
   *
   * If there's only a space vs \n difference:
   * - PC: "안녕하세요 반갑습니다"
   * - Mobile: "안녕하세요\n반갑습니다"
   * Result: "안녕하세요<Text display={[null, null, null, null, 'none']}> </Text><br />반갑습니다"
   */
  private mergeTextChildrenAcrossBreakpoints(
    treesByBreakpoint: Map<BreakpointKey, NodeTree>,
  ): string[] {
    // Collect textChildren from all breakpoints
    const textByBreakpoint = new Map<BreakpointKey, string[]>()
    for (const [bp, tree] of treesByBreakpoint) {
      if (tree.textChildren && tree.textChildren.length > 0) {
        textByBreakpoint.set(bp, tree.textChildren)
      }
    }

    // If only one breakpoint has text, return it
    if (textByBreakpoint.size <= 1) {
      if (textByBreakpoint.size === 0) {
        return []
      }
      const firstText = firstMapValue(textByBreakpoint)
      return firstText || []
    }

    // Join all text children into single strings for comparison
    const joinedByBreakpoint = new Map<BreakpointKey, string>()
    for (const [bp, textChildren] of textByBreakpoint) {
      joinedByBreakpoint.set(bp, textChildren.join(''))
    }

    // Normalize text by removing <br /> for comparison
    const normalizeForComparison = (text: string): string => {
      return text.replace(/<br \/>/g, '\n')
    }

    // Get all unique normalized texts
    const normalizedTexts = new Map<BreakpointKey, string>()
    for (const [bp, text] of joinedByBreakpoint) {
      normalizedTexts.set(bp, normalizeForComparison(text))
    }

    // Check if all texts are identical after normalization
    const uniqueNormalized = new Set([...normalizedTexts.values()])
    if (uniqueNormalized.size === 1) {
      // All same, return first text children
      return firstMapValue(textByBreakpoint)
    }

    // Texts differ - need to merge with responsive <br />
    // Find the text with the most content (usually the one with more \n)
    const breakpoints = [...normalizedTexts.keys()]

    // Compare character by character, tracking where \n appears
    // Build merged text with responsive <br /> where needed
    return this.buildResponsiveTextChildren(normalizedTexts, breakpoints)
  }

  /**
   * Build responsive text children by comparing texts across breakpoints.
   * Inserts responsive <br /> where \n exists in some breakpoints but not others.
   */
  private buildResponsiveTextChildren(
    normalizedTexts: Map<BreakpointKey, string>,
    breakpoints: BreakpointKey[],
  ): string[] {
    // Find the longest text to use as base
    let baseText = ''
    for (const [, text] of normalizedTexts) {
      if (text.length > baseText.length) {
        baseText = text
      }
    }

    // For each other breakpoint, find where they differ
    // Build a map of positions where \n appears/doesn't appear per breakpoint
    const brPositions = new Map<number, Map<BreakpointKey, boolean>>()

    // Find all \n positions in all texts
    for (const [bp, text] of normalizedTexts) {
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
          if (!brPositions.has(i)) {
            brPositions.set(i, new Map())
          }
          const posMap = brPositions.get(i)
          if (posMap) {
            posMap.set(bp, true)
          }
        }
      }
    }

    // For positions that don't have \n in some breakpoints, mark as false
    for (const [, bpMap] of brPositions) {
      for (const bp of breakpoints) {
        if (!bpMap.has(bp)) {
          bpMap.set(bp, false)
        }
      }
    }

    // Now build the result string
    // Replace \n with appropriate responsive <br />
    const result: string[] = []
    let currentSegment = ''

    for (let i = 0; i < baseText.length; i++) {
      const char = baseText[i]

      if (char === '\n') {
        // Check if all breakpoints have \n here
        const bpMap = brPositions.get(i)
        if (!bpMap) {
          currentSegment += '<br />'
          continue
        }

        const allHaveBr = [...bpMap.values()].every((v) => v)
        const noneHaveBr = [...bpMap.values()].every((v) => !v)

        if (allHaveBr) {
          // All breakpoints have <br /> - simple case
          currentSegment += '<br />'
        } else if (!noneHaveBr) {
          // Some have, some don't - need responsive display
          // Build display array: 'none' where br doesn't exist, null where it does
          const displayArray: (string | null)[] = BREAKPOINT_ORDER.map((bp) => {
            if (!bpMap.has(bp)) return null // breakpoint not in comparison
            return bpMap.get(bp) ? null : 'none'
          })

          const optimized = optimizeResponsiveValue(displayArray, 'display')

          if (optimized !== null && optimized !== 'none') {
            if (typeof optimized === 'string') {
              // Single value (shouldn't be 'none' at this point)
              currentSegment += '<br />'
            } else {
              // Responsive array
              currentSegment += `<Box as="br" display={${JSON.stringify(optimized)}} />`
            }
          }
        }
        // noneHaveBr case: shouldn't happen since we're on base text, skip
      } else {
        currentSegment += char
      }
    }

    if (currentSegment) {
      result.push(currentSegment)
    }

    return result
  }
}
