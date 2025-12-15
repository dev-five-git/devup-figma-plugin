import { getProps } from '../props'
import { renderNode } from '../render'
import { getDevupComponentByNode } from '../utils/get-devup-component'
import {
  BREAKPOINT_ORDER,
  type BreakpointKey,
  getBreakpointByWidth,
  mergePropsToResponsive,
  optimizeResponsiveValue,
} from './index'

type PropValue = boolean | string | number | undefined | null | object
type Props = Record<string, PropValue>

interface NodePropsMap {
  breakpoint: BreakpointKey
  props: Props
  children: Map<string, NodePropsMap[]>
  nodeType: string
  nodeName: string
  node: SceneNode
}

/**
 * Generate responsive code by merging children inside a Section.
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
   * Recursively extract props and children from a node.
   * Reuses getProps.
   */
  private async extractNodeProps(
    node: SceneNode,
    breakpoint: BreakpointKey,
  ): Promise<NodePropsMap> {
    const props = await getProps(node)
    const children = new Map<string, NodePropsMap[]>()

    if ('children' in node) {
      for (const child of node.children) {
        const childProps = await this.extractNodeProps(child, breakpoint)
        const existing = children.get(child.name) || []
        existing.push(childProps)
        children.set(child.name, existing)
      }
    }

    return {
      breakpoint,
      props,
      children,
      nodeType: node.type,
      nodeName: node.name,
      node,
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
      // If only one breakpoint, generate normal code (reuse existing path).
      const [, node] = [...this.breakpointNodes.entries()][0]
      return await this.generateNodeCode(node, 0)
    }

    // Extract props per breakpoint node.
    const breakpointNodeProps = new Map<BreakpointKey, NodePropsMap>()
    for (const [bp, node] of this.breakpointNodes) {
      const nodeProps = await this.extractNodeProps(node, bp)
      breakpointNodeProps.set(bp, nodeProps)
    }

    // Merge responsively and generate code.
    return await this.generateMergedCode(breakpointNodeProps, 0)
  }

  /**
   * Generate merged responsive code.
   * Reuses renderNode.
   */
  private async generateMergedCode(
    nodesByBreakpoint: Map<BreakpointKey, NodePropsMap>,
    depth: number,
  ): Promise<string> {
    // Merge props.
    const propsMap = new Map<BreakpointKey, Props>()
    for (const [bp, nodeProps] of nodesByBreakpoint) {
      propsMap.set(bp, nodeProps.props)
    }
    const mergedProps = mergePropsToResponsive(propsMap)

    // Decide component type from the first node (reuse existing util).
    const firstNodeProps = [...nodesByBreakpoint.values()][0]
    const component = getDevupComponentByNode(
      firstNodeProps.node,
      firstNodeProps.props,
    )

    // Merge child nodes (preserve order).
    const childrenCodes: string[] = []
    const processedChildNames = new Set<string>()

    // Base order on the first breakpoint children.
    const firstBreakpointChildren = firstNodeProps.children
    const allChildNames: string[] = []

    // Keep the first breakpoint child order.
    for (const name of firstBreakpointChildren.keys()) {
      allChildNames.push(name)
      processedChildNames.add(name)
    }

    // Add children that exist only in other breakpoints.
    for (const nodeProps of nodesByBreakpoint.values()) {
      for (const name of nodeProps.children.keys()) {
        if (!processedChildNames.has(name)) {
          allChildNames.push(name)
          processedChildNames.add(name)
        }
      }
    }

    for (const childName of allChildNames) {
      const childByBreakpoint = new Map<BreakpointKey, NodePropsMap>()
      const presentBreakpoints = new Set<BreakpointKey>()

      for (const [bp, nodeProps] of nodesByBreakpoint) {
        const children = nodeProps.children.get(childName)
        if (children && children.length > 0) {
          childByBreakpoint.set(bp, children[0])
          presentBreakpoints.add(bp)
        }
      }

      if (childByBreakpoint.size > 0) {
        // Add display props when a child exists only at specific breakpoints.
        if (presentBreakpoints.size < nodesByBreakpoint.size) {
          const displayProps = this.getDisplayProps(
            presentBreakpoints,
            new Set(nodesByBreakpoint.keys()),
          )
          for (const nodeProps of childByBreakpoint.values()) {
            Object.assign(nodeProps.props, displayProps)
          }
        }

        const childCode = await this.generateMergedCode(
          childByBreakpoint,
          depth,
        )
        childrenCodes.push(childCode)
      }
    }

    // Reuse renderNode.
    return renderNode(component, mergedProps, depth, childrenCodes)
  }

  /**
   * Build display props so a child shows only on present breakpoints.
   */
  private getDisplayProps(
    presentBreakpoints: Set<BreakpointKey>,
    allBreakpoints: Set<BreakpointKey>,
  ): Props {
    // Always use 5 slots: [mobile, sm, tablet, lg, pc]
    // If the child exists on the breakpoint: null (visible); otherwise 'none' (hidden).
    // If the Section lacks that breakpoint entirely: null.
    const displayValues: (string | null)[] = BREAKPOINT_ORDER.map((bp) => {
      if (!allBreakpoints.has(bp)) return null // Section lacks this breakpoint
      return presentBreakpoints.has(bp) ? null : 'none'
    })

    // If all null, return empty object.
    if (displayValues.every((v) => v === null)) {
      return {}
    }

    // Remove trailing nulls only (keep leading nulls).
    while (
      displayValues.length > 0 &&
      displayValues[displayValues.length - 1] === null
    ) {
      displayValues.pop()
    }

    // Empty array => empty object.
    if (displayValues.length === 0) {
      return {}
    }

    return { display: optimizeResponsiveValue(displayValues) }
  }

  /**
   * Generate code for a single node (fallback).
   * Reuses existing module.
   */
  private async generateNodeCode(
    node: SceneNode,
    depth: number,
  ): Promise<string> {
    const props = await getProps(node)
    const childrenCodes: string[] = []

    if ('children' in node) {
      for (const child of node.children) {
        const childCode = await this.generateNodeCode(child, depth + 1)
        childrenCodes.push(childCode)
      }
    }

    const component = getDevupComponentByNode(node, props)
    return renderNode(component, props, depth, childrenCodes)
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
