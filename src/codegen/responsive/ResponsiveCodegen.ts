import { Codegen } from '../Codegen'
import { renderComponent, renderNode } from '../render'
import type { NodeTree, Props } from '../types'
import {
  type BreakpointKey,
  getBreakpointByWidth,
  mergePropsToResponsive,
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
}
