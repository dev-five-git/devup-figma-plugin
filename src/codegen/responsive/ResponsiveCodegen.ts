import { Codegen } from '../Codegen'
import { getSelectorPropsForGroup } from '../props/selector'
import { renderComponent, renderNode } from '../render'
import type { NodeTree, Props } from '../types'
import { paddingLeftMultiline } from '../utils/padding-left-multiline'
import {
  type BreakpointKey,
  createVariantPropValue,
  getBreakpointByWidth,
  mergePropsToResponsive,
  mergePropsToVariant,
  type PropValue,
  viewportToBreakpoint,
} from '.'

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
      const [, node] = [...this.breakpointNodes.entries()][0]
      const codegen = new Codegen(node)
      const tree = await codegen.getTree()
      return Codegen.renderTree(tree, 0)
    }

    // Extract trees per breakpoint using Codegen.
    const breakpointTrees = new Map<BreakpointKey, NodeTree>()
    for (const [bp, node] of this.breakpointNodes) {
      const codegen = new Codegen(node)
      const tree = await codegen.getTree()
      breakpointTrees.set(bp, tree)
    }

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
    const firstTree = [...treesByBreakpoint.values()][0]

    // If node is INSTANCE or COMPONENT, render as component reference
    if (firstTree.isComponent) {
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
      const mergedProps = mergePropsToResponsive(propsMap)

      // If component has position props, wrap in Box
      if (Object.keys(mergedProps).length > 0) {
        const componentCode = renderNode(firstTree.component, {}, depth + 1, [])
        return renderNode('Box', mergedProps, depth, [componentCode])
      }

      return renderNode(firstTree.component, {}, depth, [])
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
        innerTrees.size > 0
          ? this.generateMergedCode(innerTrees, depth + 1)
          : ''

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
      // For text nodes, merge the text children
      // Currently just using the first tree's text children
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        firstTree.textChildren,
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
    const firstBreakpoint = [...treesByBreakpoint.keys()][0]
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
              const firstChildTree = [...childByBreakpoint.values()][0]
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
        variants[name] =
          definition.variantOptions?.map((opt) => `'${opt}'`).join(' | ') || ''
      }
    }

    // Group components by non-viewport variants
    const groups = new Map<string, Map<BreakpointKey, ComponentNode>>()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      const viewportValue = variantProps[viewportKey]
      if (!viewportValue) continue

      const breakpoint = viewportToBreakpoint(viewportValue)
      // Create group key from non-viewport variants
      const otherVariants = Object.entries(variantProps)
        .filter(([key]) => key.toLowerCase() !== 'viewport')
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

    // Check if componentSet has effect variant (pseudo-selector)
    const hasEffect = Object.keys(
      componentSet.componentPropertyDefinitions,
    ).some((key) => key.toLowerCase() === 'effect')

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

      // Get pseudo-selector props for this specific variant group
      const selectorProps = hasEffect
        ? await getSelectorPropsForGroup(componentSet, variantFilter)
        : null

      // Build trees for each viewport
      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>()
      for (const [bp, component] of viewportComponents) {
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        // Add pseudo-selector props to tree
        if (selectorProps && Object.keys(selectorProps).length > 0) {
          Object.assign(tree.props, selectorProps)
        }
        treesByBreakpoint.set(bp, tree)
      }

      // Generate merged responsive code
      const mergedCode = responsiveCodegen.generateMergedCode(
        treesByBreakpoint,
        2,
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
    for (const [name, definition] of Object.entries(
      componentSet.componentPropertyDefinitions,
    )) {
      if (definition.type === 'VARIANT') {
        const lowerName = name.toLowerCase()
        // Exclude both viewport and effect from variant keys
        // viewport is handled by responsive merging
        // effect is handled by getSelectorProps (pseudo-selectors like _hover, _active)
        if (lowerName !== 'viewport' && lowerName !== 'effect') {
          otherVariantKeys.push(name)
          variants[name] =
            definition.variantOptions?.map((opt) => `'${opt}'`).join(' | ') ||
            ''
        }
      }
    }

    // If effect variant only, skip component rendering (effect is pseudo-selector)
    if (effectKey && !viewportKey && otherVariantKeys.length === 0) {
      return []
    }

    // If no viewport variant, just handle other variants
    if (!viewportKey) {
      return ResponsiveCodegen.generateNonViewportVariantComponents(
        componentSet,
        componentName,
        otherVariantKeys,
        variants,
      )
    }

    // If no other variants, use existing viewport-only logic
    if (otherVariantKeys.length === 0) {
      return ResponsiveCodegen.generateViewportResponsiveComponents(
        componentSet,
        componentName,
      )
    }

    // Handle both viewport and other variants
    // Group by ALL variant keys combined, then by viewport within each group
    // e.g., for size+variant: { "Md|primary" => { "mobile" => Component, "pc" => Component }, ... }

    // Build a composite key from all variant values
    const buildCompositeKey = (
      variantProps: Record<string, string>,
    ): string => {
      return otherVariantKeys
        .map((key) => `${key}=${variantProps[key] || '__default__'}`)
        .join('|')
    }

    // Parse composite key back to variant values
    const parseCompositeKey = (
      compositeKey: string,
    ): Record<string, string> => {
      const result: Record<string, string> = {}
      for (const part of compositeKey.split('|')) {
        const [key, value] = part.split('=')
        result[key] = value
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
      return []
    }

    const responsiveCodegen = new ResponsiveCodegen(null)

    // Step 1: For each variant combination, merge by viewport to get responsive props
    const responsivePropsByComposite = new Map<
      string,
      Map<BreakpointKey, NodeTree>
    >()

    for (const [compositeKey, viewportComponents] of byCompositeVariant) {
      // Get pseudo-selector props for this specific variant group
      const variantFilter = parseCompositeKey(compositeKey)
      const selectorProps = effectKey
        ? await getSelectorPropsForGroup(componentSet, variantFilter)
        : null

      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>()
      for (const [bp, component] of viewportComponents) {
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        // Add pseudo-selector props to tree
        if (selectorProps && Object.keys(selectorProps).length > 0) {
          Object.assign(tree.props, selectorProps)
        }
        treesByBreakpoint.set(bp, tree)
      }
      responsivePropsByComposite.set(compositeKey, treesByBreakpoint)
    }

    // Step 2: Merge across variant values, handling multiple variant keys
    const mergedCode = responsiveCodegen.generateMultiVariantMergedCode(
      otherVariantKeys,
      responsivePropsByComposite,
      2,
    )

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, mergedCode, variants)],
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

    // Build trees for each variant
    const treesByVariant = new Map<string, NodeTree>()
    for (const [variantValue, component] of componentsByVariant) {
      // Get pseudo-selector props for this specific variant group
      const variantFilter: Record<string, string> = {
        [primaryVariantKey]: variantValue,
      }
      const selectorProps = hasEffect
        ? await getSelectorPropsForGroup(componentSet, variantFilter)
        : null

      const codegen = new Codegen(component)
      const tree = await codegen.getTree()
      // Add pseudo-selector props to tree
      if (selectorProps && Object.keys(selectorProps).length > 0) {
        Object.assign(tree.props, selectorProps)
      }
      treesByVariant.set(variantValue, tree)
    }

    // Generate merged code with variant conditionals
    const responsiveCodegen = new ResponsiveCodegen(null)
    const mergedCode = responsiveCodegen.generateVariantOnlyMergedCode(
      primaryVariantKey,
      treesByVariant,
      2,
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
      const firstTree = [...treesByBreakpoint.values()][0]
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
    const firstBreakpoint = [...treesByBreakpoint.keys()][0]
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
              const firstChildTree = [...childByBreakpoint.values()][0]
              const hiddenTree: NodeTree = {
                ...firstChildTree,
                props: { ...firstChildTree.props, display: 'none' },
              }
              childByBreakpoint.set(bp, hiddenTree)
            }
          }

          // Merge this child's props across breakpoints
          const firstChildTree = [...childByBreakpoint.values()][0]
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
    const firstTree = [...treesByVariant.values()][0]
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
    const firstVariant = [...treesByVariant.keys()][0]
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
      const firstTree = [...treesByBreakpoint.values()][0]
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
    const firstTree = [...treesByComposite.values()][0]

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
    const firstComposite = [...treesByComposite.keys()][0]
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
            const firstChildTree = [...childByComposite.values()][0]
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
        const pseudoPropsMap = new Map<string, Record<string, unknown>>()
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
          }
        }
        if (pseudoPropsMap.size > 0) {
          result[propKey] = this.mergePropsAcrossComposites(
            variantKeys,
            pseudoPropsMap,
          )
        }
        continue
      }

      // Collect values for this prop across all composites
      const valuesByComposite = new Map<string, unknown>()
      for (const [compositeKey, props] of propsMap) {
        if (propKey in props) {
          valuesByComposite.set(compositeKey, props[propKey])
        }
      }

      // Check if all values are the same
      const uniqueValues = new Set<string>()
      for (const value of valuesByComposite.values()) {
        uniqueValues.add(JSON.stringify(value))
      }

      if (uniqueValues.size === 1) {
        // All values are the same - use as-is
        result[propKey] = [...valuesByComposite.values()][0]
      } else {
        // Values differ - need to create variant conditional
        // Try to find which variant key causes the difference
        result[propKey] = this.createNestedVariantProp(
          variantKeys,
          valuesByComposite,
        )
      }
    }

    return result
  }

  /**
   * Create a nested variant prop value for props that differ across multiple variant dimensions.
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

    // For multiple variant keys, we need to determine which key(s) cause the difference
    // and create nested conditionals

    // Try each variant key to see if it alone explains the difference
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

      // Check if this variant key alone explains the difference
      // (all values within each variant value are the same)
      let variantExplainsAll = true
      const simplifiedValues: Record<string, unknown> = {}

      for (const [variantValue, subValues] of valuesByVariant) {
        const uniqueSubValues = new Set(
          [...subValues.values()].map((v) => JSON.stringify(v)),
        )
        if (uniqueSubValues.size === 1) {
          simplifiedValues[variantValue] = [...subValues.values()][0]
        } else {
          variantExplainsAll = false
          break
        }
      }

      if (variantExplainsAll) {
        // This variant key alone explains the difference
        return createVariantPropValue(
          variantKey,
          simplifiedValues as Record<string, PropValue>,
        )
      }
    }

    // Multiple variant keys contribute to the difference
    // Use the first variant key and recurse for nested conditionals
    const primaryKey = variantKeys[0]
    const remainingKeys = variantKeys.slice(1)

    const valuesByPrimaryVariant = new Map<string, Map<string, unknown>>()

    for (const [compositeKey, value] of valuesByComposite) {
      const parsed = parseCompositeKey(compositeKey)
      const primaryValue = parsed[primaryKey]

      if (!valuesByPrimaryVariant.has(primaryValue)) {
        valuesByPrimaryVariant.set(primaryValue, new Map())
      }

      const subCompositeKey = remainingKeys
        .map((k) => `${k}=${parsed[k]}`)
        .join('|')
      const primaryMap = valuesByPrimaryVariant.get(primaryValue)
      if (primaryMap) {
        primaryMap.set(subCompositeKey, value)
      }
    }

    // Create nested structure
    const nestedValues: Record<string, unknown> = {}
    for (const [primaryValue, subValues] of valuesByPrimaryVariant) {
      nestedValues[primaryValue] = this.createNestedVariantProp(
        remainingKeys,
        subValues,
      )
    }

    return createVariantPropValue(
      primaryKey,
      nestedValues as Record<string, PropValue>,
    )
  }
}
