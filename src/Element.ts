import {
  cssToProps,
  organizeProps,
  propsToComponentProps,
  propsToPropsWithTypography,
  space,
} from './utils'

export type ComponentType =
  | 'Box'
  | 'Text'
  | 'Button'
  | 'Input'
  | 'Flex'
  | 'VStack'
  | 'Center'
  | 'Image'
  | 'Grid'

export class Element {
  node: SceneNode
  props?: Record<string, string>
  css?: Record<string, string>
  additionalProps?: Record<string, string>
  componentType?: ComponentType
  fakeComponentType = false
  skipChildren: boolean = false
  constructor(node: SceneNode) {
    this.node = node
  }
  async getCss(): Promise<Record<string, string>> {
    if (this.css) return this.css
    return (this.css = await this.node.getCSSAsync())
  }
  async getProps(): Promise<Record<string, string>> {
    if (this.props) return this.props
    return (this.props = cssToProps(await this.getCss()))
  }

  async hasSpaceProps(): Promise<boolean> {
    const css = await this.getCss()
    return !!(
      css['margin'] ||
      css['padding'] ||
      css['margin-top'] ||
      css['margin-bottom'] ||
      css['margin-left'] ||
      css['margin-right'] ||
      css['padding-top'] ||
      css['padding-bottom'] ||
      css['padding-left'] ||
      css['padding-right']
    )
  }

  async getComponentType(): Promise<ComponentType> {
    if (this.componentType) return this.componentType
    switch (this.node.type) {
      case 'ELLIPSE':
        this.additionalProps = {
          borderRadius: '100%',
        }
        this.componentType = 'Box'
        break
      case 'VECTOR':
      case 'STAR':
        this.componentType = 'Image'
        break
      case 'TEXT':
        this.componentType = 'Text'
        break
      case 'FRAME':
      case 'GROUP':
      case 'INSTANCE': {
        const children = this.getChildren()
        if (
          (
            await Promise.all(
              children.map(
                async (child) =>
                  child instanceof Element &&
                  (await child.getComponentType()) === 'Image' &&
                  (!child.fakeComponentType ||
                    (children.length === 1 && !(await this.hasSpaceProps()))),
              ),
            )
          ).every((isImage) => isImage)
        ) {
          this.componentType = 'Image'
          this.skipChildren = true
          this.fakeComponentType = true
          this.additionalProps = {
            src: this.node.name,
          }
        }
        break
      }
    }
    if (this.componentType) return this.componentType
    const css = await this.getCss()
    if (css.display === 'flex' || css.display === 'inlineFlex') {
      if (
        css['justify-content'] === 'center' &&
        css['align-items'] === 'center'
      )
        this.componentType = 'Center'
      else
        this.componentType =
          css['flex-direction'] === 'column' ? 'VStack' : 'Flex'
    } else this.componentType = 'Box'
    return this.componentType
  }

  getChildren(): (string | Element)[] {
    if (this.node.type === 'TEXT') return [this.node.characters]
    if (!('children' in this.node)) return []
    const children = this.node.children
    return children.map((node) => new Element(node))
  }

  async render(dep: number = 0): Promise<string> {
    const componentType = await this.getComponentType()
    const originProps = await this.getProps()
    const mergedProps = { ...originProps, ...this.additionalProps }
    const props = organizeProps(
      this.node.type === 'TEXT'
        ? await propsToPropsWithTypography(mergedProps, this.node.textStyleId)
        : propsToComponentProps(mergedProps, componentType),
    )
    const children = this.getChildren()
    const hasChildren = children.length > 0 && !this.skipChildren
    const renderChildren = (
      await Promise.all(
        children.map((child) =>
          child instanceof Element ? child.render(dep + 1) : child,
        ),
      )
    )
      .join('\n')
      .trim()

    return `${space(dep)}<${componentType} ${Object.entries(props)
      .map(([key, value]) => `${key}="${value}"`)
      .join(
        ' ',
      )}${hasChildren ? '' : ' /'}>${hasChildren ? `\n${space(dep + 1)}${renderChildren}\n` : ''}${hasChildren ? `${space(dep)}</${componentType}>` : ''}`
  }
}
