import { getComponentName } from '../utils'
import { getProps } from './props'
import { getSelectorProps, sanitizePropertyName } from './props/selector'
import { renderComponent, renderNode } from './render'
import { renderText } from './render/text'
import type { ComponentTree, NodeTree } from './types'
import { checkAssetNode } from './utils/check-asset-node'
import { checkSameColor } from './utils/check-same-color'
import {
  getDevupComponentByNode,
  getDevupComponentByProps,
} from './utils/get-devup-component'
import { getPageNode } from './utils/get-page-node'
import { buildCssUrl } from './utils/wrap-url'

export class Codegen {
  components: Map<
    SceneNode,
    { code: string; variants: Record<string, string> }
  > = new Map()
  code: string = ''

  // Tree representations
  private tree: NodeTree | null = null
  private componentTrees: Map<SceneNode, ComponentTree> = new Map()

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
    return Array.from(this.components.entries()).map(
      ([node, { code, variants }]) =>
        [
          getComponentName(node),
          renderComponent(getComponentName(node), code, variants),
        ] as const,
    )
  }

  /**
   * Get the component nodes (SceneNode keys from components Map).
   * Useful for generating responsive codes for each component.
   */
  getComponentNodes() {
    return Array.from(this.components.keys())
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

    // Sync componentTrees to components
    for (const [compNode, compTree] of this.componentTrees) {
      if (!this.components.has(compNode)) {
        this.components.set(compNode, {
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
   */
  async buildTree(node: SceneNode = this.node): Promise<NodeTree> {
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
      return {
        component: 'src' in props ? 'Image' : 'Box',
        props,
        children: [],
        nodeType: node.type,
        nodeName: node.name,
      }
    }

    const props = await getProps(node)

    // Handle COMPONENT_SET or COMPONENT - add to componentTrees
    if (
      (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') &&
      ((this.node.type === 'COMPONENT_SET' &&
        node === this.node.defaultVariant) ||
        this.node.type === 'COMPONENT')
    ) {
      await this.addComponentTree(
        node.type === 'COMPONENT_SET' ? node.defaultVariant : node,
      )
    }

    // Handle INSTANCE nodes - treat as component reference
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync()
      if (mainComponent) await this.addComponentTree(mainComponent)

      const componentName = getComponentName(mainComponent || node)

      // Extract variant props from instance's componentProperties
      const variantProps: Record<string, string> = {}
      if (node.componentProperties) {
        for (const [key, prop] of Object.entries(node.componentProperties)) {
          if (prop.type === 'VARIANT') {
            const sanitizedKey = sanitizePropertyName(key)
            variantProps[sanitizedKey] = String(prop.value)
          }
        }
      }

      // Check if needs position wrapper
      if (props.pos) {
        return {
          component: 'Box',
          props: {
            pos: props.pos,
            top: props.top,
            left: props.left,
            right: props.right,
            bottom: props.bottom,
            transform: props.transform,
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

      return {
        component: componentName,
        props: variantProps,
        children: [],
        nodeType: node.type,
        nodeName: node.name,
        isComponent: true,
      }
    }

    // Build children recursively
    const children: NodeTree[] = []
    if ('children' in node) {
      for (const child of node.children) {
        if (child.type === 'INSTANCE') {
          const mainComponent = await child.getMainComponentAsync()
          if (mainComponent) await this.addComponentTree(mainComponent)
        }
        children.push(await this.buildTree(child))
      }
    }

    // Handle TEXT nodes
    let textChildren: string[] | undefined
    if (node.type === 'TEXT') {
      const { children: textContent, props: textProps } = await renderText(node)
      textChildren = textContent
      Object.assign(props, textProps)
    }

    const component = getDevupComponentByNode(node, props)

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
    }
    return this.tree
  }

  /**
   * Get component trees (for COMPONENT_SET/COMPONENT nodes).
   */
  getComponentTrees(): Map<SceneNode, ComponentTree> {
    return this.componentTrees
  }

  /**
   * Add a component to componentTrees.
   */
  private async addComponentTree(node: ComponentNode): Promise<void> {
    if (this.componentTrees.has(node)) return

    const childrenTrees: NodeTree[] = []
    if ('children' in node) {
      for (const child of node.children) {
        if (child.type === 'INSTANCE') {
          const mainComponent = await child.getMainComponentAsync()
          if (mainComponent) await this.addComponentTree(mainComponent)
        }
        childrenTrees.push(await this.buildTree(child))
      }
    }

    const props = await getProps(node)
    const selectorProps = await getSelectorProps(node)
    const variants: Record<string, string> = {}

    if (selectorProps) {
      Object.assign(props, selectorProps.props)
      Object.assign(variants, selectorProps.variants)
    }

    this.componentTrees.set(node, {
      name: getComponentName(node),
      tree: {
        component: getDevupComponentByProps(props),
        props,
        children: childrenTrees,
        nodeType: node.type,
        nodeName: node.name,
      },
      variants,
    })
  }

  /**
   * Check if the node is a COMPONENT_SET with viewport variant.
   */
  hasViewportVariant(): boolean {
    if (this.node.type !== 'COMPONENT_SET') return false
    return Object.keys(
      (this.node as ComponentSetNode).componentPropertyDefinitions,
    ).some((key) => key.toLowerCase() === 'viewport')
  }

  /**
   * Render a NodeTree to JSX string.
   * Static method so it can be used independently.
   */
  static renderTree(tree: NodeTree, depth: number = 0): string {
    // Handle TEXT nodes with textChildren
    if (tree.textChildren && tree.textChildren.length > 0) {
      return renderNode(tree.component, tree.props, depth, tree.textChildren)
    }

    // Children are rendered with depth 0 because renderNode handles indentation internally
    const childrenCodes = tree.children.map((child) =>
      Codegen.renderTree(child, 0),
    )
    return renderNode(tree.component, tree.props, depth, childrenCodes)
  }
}
