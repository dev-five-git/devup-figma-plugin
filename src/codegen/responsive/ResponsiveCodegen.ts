import { Codegen } from '../Codegen'
import { renderNode } from '../render'
import type { NodeTree, Props } from '../types'
import {
  BREAKPOINT_INDEX,
  type BreakpointKey,
  getBreakpointByWidth,
  mergePropsToResponsive,
} from './index'

/**
 * Generate responsive code by merging children inside a Section.
 * Uses Codegen to build NodeTree for each breakpoint, then merges them.
 */
export class ResponsiveCodegen {
  private breakpointNodes: Map<BreakpointKey, SceneNode> = new Map()

  constructor(private sectionNode: SectionNode) {
    this.categorizeChildren()
  }

  /**
   * Group Section children by width to decide breakpoints.
   */
  private categorizeChildren() {
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
    console.log('breakpointTrees', breakpointTrees)

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
  private generateMergedCode(
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
      const childByBreakpoint = new Map<BreakpointKey, NodeTree>()
      const presentBreakpoints = new Set<BreakpointKey>()

      for (const [bp, childMap] of childrenMaps) {
        const children = childMap.get(childName)
        if (children && children.length > 0) {
          childByBreakpoint.set(bp, children[0])
          presentBreakpoints.add(bp)
        }
      }

      if (childByBreakpoint.size > 0) {
        // Add display:none props when a child exists only at specific breakpoints
        // Find the smallest breakpoint where child exists
        const sortedPresentBreakpoints = [...presentBreakpoints].sort(
          (a, b) => BREAKPOINT_INDEX[a] - BREAKPOINT_INDEX[b],
        )
        const smallestPresentBp = sortedPresentBreakpoints[0]
        const smallestPresentIdx = BREAKPOINT_INDEX[smallestPresentBp]

        // Find the smallest breakpoint in the section
        const sortedSectionBreakpoints = [...treesByBreakpoint.keys()].sort(
          (a, b) => BREAKPOINT_INDEX[a] - BREAKPOINT_INDEX[b],
        )
        const smallestSectionBp = sortedSectionBreakpoints[0]
        const smallestSectionIdx = BREAKPOINT_INDEX[smallestSectionBp]

        // If child's smallest breakpoint is larger than section's smallest,
        // we need to add display:none for the smaller breakpoints
        if (smallestPresentIdx > smallestSectionIdx) {
          // Add display:none for all breakpoints smaller than where child exists
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
        }

        const childCode = this.generateMergedCode(childByBreakpoint, depth)
        childrenCodes.push(childCode)
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
}
