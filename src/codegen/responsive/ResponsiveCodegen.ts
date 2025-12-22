import { getComponentName } from '../../utils'
import { getProps } from '../props'
import { renderNode } from '../render'
import { renderText } from '../render/text'
import { getDevupComponentByNode } from '../utils/get-devup-component'
import {
  type BreakpointKey,
  getBreakpointByWidth,
  mergePropsToResponsive,
} from './index'

type Props = Record<string, unknown>

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

    // If node is TEXT, apply typography
    if (node.type === 'TEXT') {
      const { props: textProps } = await renderText(node)
      Object.assign(props, textProps)
    }

    // If node is INSTANCE or COMPONENT, don't extract children (treat as component reference)
    const isComponent =
      node.type === 'INSTANCE' ||
      node.type === 'COMPONENT' ||
      node.type === 'COMPONENT_SET'

    if ('children' in node && !isComponent) {
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
    // Decide component type from the first node (reuse existing util).
    const firstNodeProps = [...nodesByBreakpoint.values()][0]
    const nodeType = firstNodeProps.nodeType

    // If node is INSTANCE or COMPONENT, render as component reference (no children, no props merge)
    if (
      nodeType === 'INSTANCE' ||
      nodeType === 'COMPONENT' ||
      nodeType === 'COMPONENT_SET'
    ) {
      const componentName = getComponentName(firstNodeProps.node)
      // For components, we might still need position props
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, nodeProps] of nodesByBreakpoint) {
        // Only keep position-related props for components
        const posProps: Props = {}
        if (nodeProps.props.pos) posProps.pos = nodeProps.props.pos
        if (nodeProps.props.top) posProps.top = nodeProps.props.top
        if (nodeProps.props.left) posProps.left = nodeProps.props.left
        if (nodeProps.props.right) posProps.right = nodeProps.props.right
        if (nodeProps.props.bottom) posProps.bottom = nodeProps.props.bottom
        propsMap.set(bp, posProps)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // If component has position props, wrap in Box
      if (Object.keys(mergedProps).length > 0) {
        const componentCode = renderNode(componentName, {}, depth + 1, [])
        return renderNode('Box', mergedProps, depth, [componentCode])
      }

      return renderNode(componentName, {}, depth, [])
    }

    // Merge props.
    const propsMap = new Map<BreakpointKey, Props>()
    for (const [bp, nodeProps] of nodesByBreakpoint) {
      propsMap.set(bp, nodeProps.props)
    }
    const mergedProps = mergePropsToResponsive(propsMap)

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
          const allBreakpointsSet = new Set(nodesByBreakpoint.keys())
          for (const [bp, nodeProps] of childByBreakpoint) {
            // Only set display if this breakpoint exists in section but child doesn't exist
            if (!presentBreakpoints.has(bp) && allBreakpointsSet.has(bp)) {
              nodeProps.props.display = 'none'
            }
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
   * Generate code for a single node (fallback).
   * Reuses existing module.
   */
  private async generateNodeCode(
    node: SceneNode,
    depth: number,
  ): Promise<string> {
    // If node is INSTANCE or COMPONENT, render as component reference
    if (
      node.type === 'INSTANCE' ||
      node.type === 'COMPONENT' ||
      node.type === 'COMPONENT_SET'
    ) {
      const componentName = getComponentName(node)
      const props = await getProps(node)

      // Check if component has position props
      if (props.pos) {
        const posProps = {
          pos: props.pos,
          top: props.top,
          left: props.left,
          right: props.right,
          bottom: props.bottom,
        }
        const componentCode = renderNode(componentName, {}, depth + 1, [])
        return renderNode('Box', posProps, depth, [componentCode])
      }

      return renderNode(componentName, {}, depth, [])
    }

    const props = await getProps(node)
    const childrenCodes: string[] = []

    if ('children' in node) {
      for (const child of node.children) {
        const childCode = await this.generateNodeCode(child, depth + 1)
        childrenCodes.push(childCode)
      }
    }

    // If node is TEXT, apply typography
    if (node.type === 'TEXT') {
      const { children, props: _props } = await renderText(node)
      childrenCodes.push(...children)
      Object.assign(props, _props)
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
