import {
  checkImageChildrenType,
  cssToProps,
  organizeProps,
  propsToComponentProps,
  propsToPropsWithTypography,
  space,
} from './utils'
import { extractKeyValueFromCssVar } from './utils/extract-key-value-from-css-var'

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
  | 'svg'

export class Element {
  node: SceneNode
  props?: Record<string, string>
  css?: Record<string, string>
  additionalProps?: Record<string, string>
  // for svg
  svgVarKeyValue?: [string, string]
  componentType?: ComponentType
  skipChildren: boolean = false
  constructor(node: SceneNode) {
    this.node = node
  }
  async getCss(): Promise<Record<string, string>> {
    if (this.css) return this.css
    this.css = await this.node.getCSSAsync()
    if (
      this.css['width']?.endsWith('px') &&
      this.node.parent &&
      'width' in this.node.parent &&
      this.node.width === this.node.parent.width
    )
      this.css['width'] = '100%'
    return this.css
  }
  async getProps(): Promise<Record<string, string>> {
    if (this.props) return this.props
    return (this.props = cssToProps(await this.getCss()))
  }

  async hasSpaceProps(): Promise<boolean> {
    const css = await this.getCss()
    return !!(
      css['gap'] ||
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
          borderRadius: '50%',
        }
        this.componentType = 'Box'
        break
      case 'VECTOR':
      case 'STAR': {
        const fill = (await this.getCss()).fill
        if (fill?.startsWith('var(--')) {
          this.componentType = 'svg'
          this.svgVarKeyValue = extractKeyValueFromCssVar(fill)
          break
        }
        this.componentType = 'Image'
        this.additionalProps = cssToProps({
          src: this.node.name,
          width: this.node.width + 'px',
          height: this.node.height + 'px',
        })
        break
      }
      case 'TEXT':
        this.componentType = 'Text'
        break
      case 'FRAME':
      case 'BOOLEAN_OPERATION':
      case 'GROUP':
      case 'INSTANCE': {
        if (this.node.children.length > 1 && (await this.hasSpaceProps())) break
        const res = await checkImageChildrenType(this.node)
        if (res) {
          if (res.type === 'SVG' && res.fill) {
            this.componentType = 'svg'
            this.skipChildren = true
            this.svgVarKeyValue = extractKeyValueFromCssVar(res.fill)
            break
          }

          this.componentType = 'Image'
          this.skipChildren = true
          this.additionalProps = cssToProps({
            src: this.node.name,
            width: this.node.width + 'px',
            height: this.node.height + 'px',
          })
        }
        break
      }
    }
    if (this.componentType) return this.componentType
    const css = await this.getCss()
    if (css.display === 'flex' || css.display === 'inline-flex') {
      this.componentType =
        css['justify-content'] === 'center' && css['align-items'] === 'center'
          ? 'Center'
          : css['flex-direction'] === 'column'
            ? 'VStack'
            : 'Flex'
    } else this.componentType = 'Box'
    return this.componentType
  }

  getChildren(): (string | Element)[] {
    if (this.node.type === 'TEXT')
      return this.node.characters ? [this.node.characters] : []
    if (!('children' in this.node)) return []
    return this.node.children.map((node) => new Element(node))
  }

  async render(dep: number = 0): Promise<string> {
    const componentType = await this.getComponentType()

    if (componentType === 'svg') {
      //   prue svg
      let value = (
        await this.node.exportAsync({
          format: 'SVG_STRING',
        })
      ).toString()

      if (this.svgVarKeyValue) {
        value = value.replaceAll(this.svgVarKeyValue[1], 'currentColor')
        value = value.replace(
          '<svg',
          `<svg className={css({ color: "${this.svgVarKeyValue[0]}" })}`,
        )
      }

      const newLineCount = value.split('\n').filter(Boolean).length
      let idx = 0
      return value
        .replaceAll(/(\n)/g, (_, letter) => {
          if (newLineCount / 2 > idx + 1) idx += 1
          else idx -= 1
          return letter + space(dep + idx)
        })
        .trim()
    }
    const originProps = await this.getProps()
    const mergedProps = { ...originProps, ...this.additionalProps }
    const children = this.getChildren()
    const props = organizeProps(
      this.node.type === 'TEXT'
        ? await propsToPropsWithTypography(mergedProps, this.node.textStyleId)
        : propsToComponentProps(mergedProps, componentType, children.length),
    )

    const hasChildren = children.length > 0 && !this.skipChildren
    const renderChildren = hasChildren
      ? (
          await Promise.all(
            children.map((child) =>
              child instanceof Element ? child.render(dep + 1) : child,
            ),
          )
        )
          .join('\n')
          .trim()
      : ''

    const propsString = Object.entries(props)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')
    return `${space(dep)}<${componentType}${propsString ? ' ' + propsString : ''}${hasChildren ? '' : ' /'}>${hasChildren ? `\n${space(dep + 1)}${renderChildren}\n` : ''}${hasChildren ? `${space(dep)}</${componentType}>` : ''}`
  }
}
