import {
  checkSvgImageChildrenType,
  colorFromFills,
  createInterface,
  cssToProps,
  filterPropsByChildrenCountAndType,
  fixChildrenText,
  formatSvg,
  getElementProps,
  organizeProps,
  propsToComponentProps,
  propsToPropsWithTypography,
  space,
} from './utils'
import { extractKeyValueFromCssVar } from './utils/extract-key-value-from-css-var'
import { textSegmentToTypography } from './utils/text-segment-to-typography'
import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

export type ComponentType =
  | 'Fragment'
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
const SEGMENT_TYPE = [
  'fontName',
  'fontWeight',
  'fontSize',
  'textDecoration',
  'textCase',
  'lineHeight',
  'letterSpacing',
  'fills',
  'textStyleId',
  'fillStyleId',
  'listOptions',
  'indentation',
  'hyperlink',
] as (keyof Omit<StyledTextSegment, 'characters' | 'start' | 'end'>)[]

export class Element {
  node: SceneNode
  props?: Record<string, string>
  css?: Record<string, string>
  additionalProps?: Record<string, string>
  parent?: Element
  // for svg
  svgVarKeyValue?: [string, string]
  componentType?: ComponentType
  skipChildren: boolean = false
  assets: Record<string, () => Promise<Uint8Array>> = {}
  components: Record<string, () => Promise<string>> = {}
  constructor(node: SceneNode, parent?: Element) {
    this.node = node
    this.parent = parent
  }
  async getCss(): Promise<Record<string, string>> {
    if (this.css) return this.css
    this.css = await this.node.getCSSAsync().catch(() => ({
      error: 'getCSSAsync Error',
    }))
    if (this.css['width']?.endsWith('px') && this.node.parent) {
      if (
        this.node.parent.type === 'SECTION' ||
        this.node.parent.type === 'PAGE' ||
        // inline case
        (this.node.parent as any).layoutSizingHorizontal == 'HUG'
      )
        delete this.css['width']
      else if (
        'width' in this.node.parent &&
        this.node.width === this.node.parent.width
      ) {
        this.css['width'] = '100%'
      }
    }
    // Image has not padding
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
  getImageProps(
    dir: 'icons' | 'images',
    extension: 'svg' | 'png',
  ): Record<string, string> {
    return cssToProps(
      this.node.parent &&
        'width' in this.node.parent &&
        this.node.parent.width === this.node.width
        ? {
            src: `/${dir}/${this.node.name}.${extension}`,
            width: '100%',
            height: '',
            'aspect-ratio': `${Math.floor((this.node.width / this.node.height) * 100) / 100}`,
          }
        : {
            src: `/${dir}/${this.node.name}.${extension}`,
            width: this.node.width + 'px',
            height: this.node.height + 'px',
          },
    )
  }

  async getComponentType(): Promise<ComponentType> {
    if (this.componentType) return this.componentType

    if (
      'children' in this.node &&
      this.node.children.some(
        (child) =>
          'layoutPositioning' in child &&
          child.layoutPositioning === 'ABSOLUTE',
      )
    )
      this.additionalProps = {
        position: 'relative',
      }
    else {
      this.additionalProps = {}
    }
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
        this.addAsset(this.node, 'svg')
        Object.assign(
          this.additionalProps,
          this.getImageProps(
            this.node.width !== this.node.height ? 'images' : 'icons',
            'svg',
          ),
        )
        break
      }
      case 'TEXT':
        this.componentType = 'Text'
        break
      case 'RECTANGLE': {
        if (
          (this.node.fills as any).find((fill: any) => fill.type === 'IMAGE')
        ) {
          const css = await this.getCss()
          this.componentType =
            (this.node.fills as any).length === 1 ? 'Image' : 'Box'
          Object.assign(
            this.additionalProps,
            this.getImageProps('images', 'png'),
          )
          if (this.componentType !== 'Image') {
            this.additionalProps.bg = css.background.replace(
              '<path-to-image>',
              this.additionalProps.src,
            )

            delete this.additionalProps.src
          } else {
            this.additionalProps.bg = ''
          }
          this.addAsset(this.node, 'png')
        }
        const css = await this.getCss()
        if (this.node.width === 1 && !('width' in css))
          this.additionalProps.w = '1px'
        break
      }
      case 'FRAME':
      case 'BOOLEAN_OPERATION':
      case 'GROUP':
      case 'COMPONENT':
      case 'INSTANCE': {
        if (this.node.children.length > 1 && (await this.hasSpaceProps())) break
        // has instance type children, skip
        // if (this.node.children.some((child) => child.type === 'INSTANCE')) break
        // if child is square, It is an icon asset
        if (
          this.node.width !== this.node.height &&
          this.node.children.length === 1 &&
          this.node.children.some((child) => child.width === child.height)
        )
          break
        const res = await checkSvgImageChildrenType(this.node)
        if (res) {
          if (res.type === 'SVG' && res.fill.size > 0) {
            if (res.fill.size === 1) {
              // mask image
              this.componentType = 'Box'
              this.skipChildren = true

              const props = this.getImageProps('icons', 'svg')
              props['maskImage'] = `url(${props.src})`
              delete props.src
              delete props.aspectRatio
              Object.assign(this.additionalProps, {
                ...props,
                bg: res.fill.values().next().value,
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
              })
              this.addAsset(this.node, 'svg')
            } else {
              this.componentType = 'svg'
              // render string
              this.skipChildren = false

              this.addAsset(this.node, 'svg')
            }
            break
          }

          this.componentType = 'Image'
          this.skipChildren = true
          Object.assign(
            this.additionalProps,
            this.getImageProps('icons', 'svg'),
          )
          this.addAsset(this.node, 'svg')
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
    return this.node.children.map((node) => new Element(node, this))
  }

  async getAssets(): Promise<Record<string, () => Promise<Uint8Array>>> {
    await this.render()
    return this.assets
  }
  addAsset(node: SceneNode, type: 'svg' | 'png') {
    if (
      type === 'svg' &&
      this.getChildren().length &&
      this.getChildren().every((c) => typeof c !== 'string' && !c.node.visible)
    ) {
      return
    }
    if (this.parent) this.parent.addAsset(node, type)
    else {
      let key = node.name
      let idx = 0
      while (key + '.' + type in this.assets) {
        key = node.name + '_' + idx
        idx++
      }
      this.assets[key + '.' + type] = async () => {
        const isSvg = type === 'svg'
        const options: ExportSettings = {
          format: isSvg ? 'SVG' : 'PNG',
        }
        if (options.format !== 'SVG') {
          ;(options as any).constraint = {
            type: 'SCALE',
            value: 1.5,
          }
        } else {
          ;(options as any).useAbsoluteBounds = true
        }
        const data = await node.exportAsync(options)
        return data
      }
    }
  }

  async getComponents(): Promise<Record<string, () => Promise<string>>> {
    await this.render()
    return this.components
  }

  addComponent(node: SceneNode) {
    if (this.parent) this.parent.addComponent(node)
    else
      this.components[toPascal(node.name) + '.tsx'] = async () => {
        return (await new Element(node).render()).trim()
      }
  }

  async render(dep: number = 0): Promise<string> {
    if (!this.node.visible) return ''

    if (this.node.type === 'COMPONENT_SET') {
      return (
        await Promise.all(
          this.node.children
            .map((child) => new Element(child, this))
            .map((child) => child.render(dep)),
        )
      ).join('\n')
    }

    const componentType = await this.getComponentType()

    if (componentType === 'svg') {
      // prue svg
      const value = (
        await this.node.exportAsync({
          format: 'SVG_STRING',
          useAbsoluteBounds: true,
        })
      ).toString()

      return formatSvg(value, dep)
    }

    const originProps = await this.getProps()

    if ('error' in originProps)
      return `<${componentType} error="${originProps.error}" />`

    const children = this.getChildren()
    const mergedProps = filterPropsByChildrenCountAndType(
      children.length,
      componentType,
      {
        ...originProps,
        ...this.additionalProps,
      },
    )

    if (this.node.type === 'TEXT') {
      const segs = this.node.getStyledTextSegments(SEGMENT_TYPE)

      // select main color, 가장 자주 사용되는 색상
      const propsArray = await Promise.all(
        segs.map(async (seg) =>
          propsToComponentProps(
            organizeProps(
              Object.fromEntries(
                Object.entries(
                  await propsToPropsWithTypography(
                    {
                      ...mergedProps,
                      ...((await textSegmentToTypography(seg)) as any),
                      color: await colorFromFills(seg.fills as any),
                    },
                    seg.textStyleId,
                  ),
                )
                  .filter(([_, value]) => Boolean(value))
                  .map(([key, value]) => [key, String(value)]),
              ),
            ),
            'Text',
            1,
          ),
        ),
      )
      let mainColor = ''
      let mainColorCount = 0
      let mainTypography = ''
      let mainTypographyCount = 0

      propsArray.forEach((props) => {
        const filterdColor = propsArray.filter((p) => p.color === props.color)
        if (filterdColor.length > mainColorCount) {
          mainColor = props.color
          mainColorCount = filterdColor.length
        }

        const filterdTypography = propsArray.filter(
          (p) => p.typography === props.typography,
        )
        if (filterdTypography.length > mainTypographyCount) {
          mainTypography = props.typography
          mainTypographyCount = filterdTypography.length
        }
      })

      const children = (
        await Promise.all(
          segs.map(async (seg, idx) => {
            const props = propsArray[idx]
            if (segs.length > 1 && mainColor === props.color) delete props.color
            if (segs.length > 1 && mainTypography === props.typography)
              delete props.typography
            let text = fixChildrenText(seg.characters)
            let textComponent: 'ul' | 'ol' | null = null
            const textDep = segs.length > 1 ? dep + 2 : dep + 1

            const propsStr = Object.entries(props)
              .map(([key, value]) => `${key}="${value}"`)
              .join(' ')
            const pureText = segs.length > 1 && !propsStr

            if (seg.listOptions.type === 'NONE') {
              text =
                space(pureText ? textDep - 1 : textDep) +
                text.replaceAll('\n', '<br />')
            } else {
              switch (seg.listOptions.type) {
                case 'UNORDERED': {
                  textComponent = 'ul'
                  break
                }
                case 'ORDERED': {
                  textComponent = 'ol'
                  break
                }
              }
              text = text
                .split('\n')
                .map((line) => `${space(textDep)}<li>${line}</li>`)
                .join('\n')
            }
            if (pureText) return text

            return `${segs.length > 1 ? space(textDep - 1) : ''}<Text${
              textComponent ? ` as="${textComponent}" my="0px" pl="1.5em"` : ''
            } ${propsStr}>\n${text}\n${space(textDep - 1)}</Text>`
          }),
        )
      ).join('\n')

      const propsStr = Object.entries(
        organizeProps({
          color: mainColor,
          typography: mainTypography,
        }),
      )
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')

      return (
        space(dep) +
        (segs.length > 1
          ? `<Text${propsStr ? ' ' + propsStr : ''}>\n${children}\n${space(dep)}</Text>`
          : children)
      )
    }

    const props = organizeProps(
      propsToComponentProps(mergedProps, componentType, children.length),
    )

    const hasChildren = children.length > 0 && !this.skipChildren

    const renderChildren = hasChildren
      ? (
          await Promise.all(
            children.map((child) => (child as Element).render(dep + 1)),
          )
        )
          .join('\n')
          .trim()
      : ''

    const propsString = Object.entries(props)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ')
    const body = `${space(dep)}<${componentType}${propsString ? ' ' + propsString : ''}${hasChildren ? '' : ' /'}>${hasChildren ? `\n${space(dep + 1)}${renderChildren}\n` : ''}${hasChildren ? `${space(dep)}</${componentType}>` : ''}`

    if (this.node.type === 'INSTANCE' && this.componentType !== 'Image') {
      const { componentProperties } = this.node
      let componentChildren = ''
      const props = Object.entries(componentProperties)
        .filter(([key, value]) => {
          if (
            value.type === 'TEXT' &&
            toCamel(key.split('#')[0]) === 'children'
          ) {
            componentChildren += value.value
            return false
          }
          return true
        })
        .map(getElementProps)
        .join(' ')
      const content =
        space(dep) +
        `<${toPascal(this.node.name)}${props ? ' ' + props : ''}${
          !componentChildren
            ? ' />'
            : `>\n${space(dep + 1)}${componentChildren}\n${space(dep)}</${toPascal(this.node.name)}>`
        }`

      if (!this.parent) {
        const mainComponent = await this.node.getMainComponentAsync()
        if (mainComponent) {
          const mainComponentElement = new Element(mainComponent)
          const mainComponentChildren = await mainComponentElement.render(dep)
          return `${content}\n\n/*\n${mainComponentChildren}\n*/`
        }
      }
      return content
    }

    if (this.node.type === 'COMPONENT') {
      this.addComponent(this.node)
      const componentName = toPascal(this.node.name)
      const interfaceDecl = createInterface(
        componentName,
        this.node.variantProperties,
      )
      return `${interfaceDecl ? interfaceDecl + '\n' : ''}${space(dep)}export function ${componentName}(${interfaceDecl ? `props: ${componentName}Props` : ''}) {
  return (
${body
  .split('\n')
  .map((line) => space(dep + 2) + line)
  .join('\n')}
  )
}`
    }
    return body
  }
}
