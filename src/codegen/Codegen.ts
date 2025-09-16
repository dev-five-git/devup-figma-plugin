import { getComponentName } from '../utils'
import { getProps } from './props'
import { renderComponent, renderNode } from './render'
import { renderText } from './render/text'
import { checkAssetNode } from './utils/check-asset-node'
import { checkSameColor } from './utils/check-same-color'
import {
  getDevupComponentByNode,
  getDevupComponentByProps,
} from './utils/get-devup-component'

export class Codegen {
  components: Map<SceneNode, string> = new Map()
  code: string = ''

  constructor(private node: SceneNode) {}

  getCode() {
    return this.code
  }

  getComponentsCode() {
    return Array.from(this.components.entries())
      .map(([node, code]) => renderComponent(getComponentName(node), code))
      .join('\n\n')
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

    this.components.set(
      node,
      renderNode(
        getDevupComponentByProps(props),
        props,
        2,
        await Promise.all(childrenCodes),
      ),
    )
  }

  async run(node: SceneNode = this.node, dep: number = 0): Promise<string> {
    const assetNode = checkAssetNode(node)
    if (assetNode) {
      const props = await getProps(node)
      props.src = '/icons/' + node.name + '.' + assetNode
      if (assetNode === 'svg') {
        const maskColor = await checkSameColor(node)
        if (maskColor) {
          // support mask image icon
          props.maskImage = `url(${props.src})`
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

    if (node.type === 'INSTANCE') {
      const mainComponent = await node.getMainComponentAsync()
      if (mainComponent) await this.addComponent(mainComponent)
      const ret = renderNode(getComponentName(node), {}, dep, [])
      if (node === this.node) this.code = ret
      return ret
    }
    const props = await getProps(node)
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
