import { getComponentName } from '../utils'
import { getProps } from './props'
import { renderComponent, renderNode } from './render'
import { renderText } from './render/text'
import { checkAssetNode } from './utils/check-asset-node'
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

    this.components.set(
      node,
      renderNode(
        getDevupComponentByProps(getProps(node)),
        getProps(node),
        2,
        await Promise.all(childrenCodes),
      ),
    )
  }

  async run(node: SceneNode = this.node, dep: number = 0): Promise<string> {
    const assetNode = checkAssetNode(node)
    if (assetNode) {
      const props = getProps(node)
      const ret = renderNode('Image', props, dep, [])
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
    const props = getProps(node)
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
      getDevupComponentByNode(node),
      props,
      dep,
      childrenCodes,
    )
    if (node === this.node) this.code = ret
    return ret
  }
}
