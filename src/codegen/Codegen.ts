import { getComponentName } from '../utils'
import { getProps } from './props'
import { getSelectorProps } from './props/selector'
import { renderComponent, renderNode } from './render'
import { renderText } from './render/text'
import { checkAssetNode } from './utils/check-asset-node'
import { checkSameColor } from './utils/check-same-color'
import { findPageRoot } from './utils/find-page-root'
import {
  getDevupComponentByNode,
  getDevupComponentByProps,
} from './utils/get-devup-component'
import { buildCssUrl } from './utils/wrap-url'

export class Codegen {
  components: Map<
    SceneNode,
    { code: string; variants: Record<string, string> }
  > = new Map()
  code: string = ''

  constructor(private node: SceneNode) {
    if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
      this.node = node.parent
    } else {
      this.node = node
    }
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

  async addComponent(node: ComponentNode) {
    const childrenCodes =
      'children' in node
        ? node.children.map(async (child) => {
            if (child.type === 'INSTANCE') {
              const mainComponent = await child.getMainComponentAsync()
              if (mainComponent) await this.addComponent(mainComponent)
            }

            return await this.run(child, 0)
          })
        : []
    const props = await getProps(node)
    const selectorProps = await getSelectorProps(node)
    const variants = {}

    if (selectorProps) {
      Object.assign(props, selectorProps.props)
      Object.assign(variants, selectorProps.variants)
    }

    this.components.set(node, {
      code: renderNode(
        getDevupComponentByProps(props),
        props,
        2,
        await Promise.all(childrenCodes),
      ),
      variants,
    })
  }

  async run(node: SceneNode = this.node, dep: number = 0): Promise<string> {
    const assetNode = checkAssetNode(node)
    if (assetNode) {
      const props = await getProps(node)
      props.src = `/${assetNode === 'svg' ? 'icons' : 'images'}/${node.name}.${assetNode}`
      if (assetNode === 'svg') {
        const maskColor = await checkSameColor(node)
        if (maskColor) {
          // support mask image icon
          props.maskImage = buildCssUrl(props.src as string)
          props.maskRepeat = 'no-repeat'
          props.maskSize = 'contain'
          props.bg = maskColor
          delete props.src
        }
      }
      const ret = renderNode('src' in props ? 'Image' : 'Box', props, dep, [])
      if (node === this.node) this.code = ret
      return ret
    }

    const props = await getProps(node)
    if (
      (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') &&
      ((this.node.type === 'COMPONENT_SET' &&
        node === this.node.defaultVariant) ||
        this.node.type === 'COMPONENT')
    ) {
      await this.addComponent(
        node.type === 'COMPONENT_SET' ? node.defaultVariant : node,
      )
    }
    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync()
      if (mainComponent) await this.addComponent(mainComponent)
      let ret = renderNode(getComponentName(mainComponent || node), {}, dep, [])
      if (props.pos) {
        ret = renderNode(
          'Box',
          {
            pos: props.pos,
            top: props.top,
            left: props.left,
            right: props.right,
            bottom: props.bottom,
            w:
              // if the node is a page root, set the width to 100%
              (findPageRoot(node) as SceneNode)?.width === node.width
                ? '100%'
                : undefined,
          },
          dep,
          [ret],
        )
      }
      if (node === this.node) this.code = ret
      return ret
    }
    const childrenCodes = await Promise.all(
      'children' in node
        ? node.children.map(async (child) => {
            if (child.type === 'INSTANCE') {
              const mainComponent = await child.getMainComponentAsync()
              if (mainComponent) await this.addComponent(mainComponent)
            }
            return await this.run(child)
          })
        : [],
    )
    if (node.type === 'TEXT') {
      const { children, props: _props } = await renderText(node)
      childrenCodes.push(...children)
      Object.assign(props, _props)
    }
    const ret = renderNode(
      getDevupComponentByNode(node, props),
      props,
      dep,
      childrenCodes,
    )
    if (node === this.node) this.code = ret
    return ret
  }
}
