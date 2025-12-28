import { Codegen } from '../Codegen'
import { renderComponent, renderNode } from '../render'
import type { NodeTree, Props } from '../types'
import {
  type BreakpointKey,
  getBreakpointByWidth,
  mergePropsToResponsive,
  mergePropsToVariant,
  viewportToBreakpoint,
} from './index'

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

    // Generate responsive code for each group
    const results: Array<readonly [string, string]> = []
    const responsiveCodegen = new ResponsiveCodegen(null)

    for (const [, viewportComponents] of groups) {
      // Build trees for each viewport
      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>()
      for (const [bp, component] of viewportComponents) {
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
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
        if (lowerName !== 'viewport') {
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
    // For simplicity, use the first non-viewport variant key
    const primaryVariantKey = otherVariantKeys[0]

    // Group by variant value first, then by viewport within each group
    // e.g., { "default" => { "mobile" => Component, "pc" => Component }, "scroll" => { ... } }
    const byVariantValue = new Map<string, Map<BreakpointKey, ComponentNode>>()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      const viewportValue = variantProps[viewportKey]
      if (!viewportValue) continue

      const breakpoint = viewportToBreakpoint(viewportValue)
      const variantValue = variantProps[primaryVariantKey] || '__default__'

      if (!byVariantValue.has(variantValue)) {
        byVariantValue.set(variantValue, new Map())
      }
      const byBreakpoint = byVariantValue.get(variantValue)
      if (byBreakpoint) {
        byBreakpoint.set(breakpoint, component)
      }
    }

    if (byVariantValue.size === 0) {
      return []
    }

    const responsiveCodegen = new ResponsiveCodegen(null)

    // Step 1: For each variant value, merge by viewport to get responsive props
    const mergedTreesByVariant = new Map<string, NodeTree>()
    const responsivePropsByVariant = new Map<
      string,
      Map<BreakpointKey, NodeTree>
    >()

    for (const [variantValue, viewportComponents] of byVariantValue) {
      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>()
      for (const [bp, component] of viewportComponents) {
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        treesByBreakpoint.set(bp, tree)
      }
      responsivePropsByVariant.set(variantValue, treesByBreakpoint)

      // Get merged tree with responsive props
      const firstTree = [...treesByBreakpoint.values()][0]
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)
      mergedTreesByVariant.set(variantValue, {
        ...firstTree,
        props: mergedProps,
      })
    }

    // Step 2: Merge across variant values to create conditional props
    const mergedCode = responsiveCodegen.generateVariantMergedCode(
      primaryVariantKey,
      responsivePropsByVariant,
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

    // Build trees for each variant
    const treesByVariant = new Map<string, NodeTree>()
    for (const [variantValue, component] of componentsByVariant) {
      const codegen = new Codegen(component)
      const tree = await codegen.getTree()
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
              childrenCodes.push(
                `{${variantKey} === "${onlyVariant}" && ${childCode.includes('\n') ? `(\n${childCode}\n)` : childCode}}`,
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
              childrenCodes.push(
                `{(${conditions}) && ${childCode.includes('\n') ? `(\n${childCode}\n)` : childCode}}`,
              )
            }
          }
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }
}
