import { render, renderFunction, renderInterfaceFromNode } from './render'
import { type ComponentType, type DevupNode, InstanceSymbol } from './types'
import {
  addSelectorProps,
  checkSvgImageChildrenType,
  colorFromFills,
  cssToProps,
  fixChildrenText,
  formatSvg,
  getComponentName,
  organizeProps,
  propsToComponentProps,
  propsToPropsWithTypography,
} from './utils'
import { extractKeyValueFromCssVar } from './utils/extract-key-value-from-css-var'
import { textSegmentToTypography } from './utils/text-segment-to-typography'
import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

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
export const commonIsAbsolutePosition = (node: SceneNode) => {
  return !!(
    ('layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE') ||
    (node.parent &&
      (('layoutMode' in node.parent && node.parent.layoutMode === 'NONE') ||
        ('layoutMode' in node.parent && !node.parent.layoutMode)))
  )
}

export class Element<T extends SceneNode = SceneNode> {
  node: T
  props?: Record<string, string>
  css?: Record<string, string>
  additionalProps?: Record<string, string>
  parent?: Element<SceneNode>
  // for svg
  svgVarKeyValue?: [string, string]
  componentType?: ComponentType
  skipChildren: boolean = false
  assets: Record<string, () => Promise<Uint8Array>> = {}
  components: Record<string, () => Promise<string>> = {}
  constructor(node: T, parent?: Element<T>) {
    this.node = node
    this.parent = parent
  }
  async getCss(): Promise<Record<string, string>> {
    if (this.css) return this.css
    this.css = await this.node.getCSSAsync()
    if (
      this.node.type !== 'COMPONENT' &&
      this.node.type !== 'COMPONENT_SET' &&
      this.parent &&
      this.node.parent &&
      this.node.parent.type !== 'COMPONENT' &&
      this.node.parent.type !== 'COMPONENT_SET' &&
      'width' in this.node.parent &&
      'height' in this.node.parent &&
      'constraints' in this.node &&
      commonIsAbsolutePosition(this.node)
    ) {
      const { horizontal, vertical } = this.node.constraints
      this.css['pos'] = 'absolute'
      switch (horizontal) {
        case 'MIN':
          this.css['left'] = this.node.x + 'px'
          break
        case 'MAX':
          this.css['right'] = this.node.parent.width - this.node.x + 'px'
          break
        default:
          this.css['left'] = '0px'
          this.css['right'] = '0px'
          break
      }
      switch (vertical) {
        case 'MIN':
          this.css['top'] = this.node.y + 'px'
          break
        case 'MAX':
          this.css['bottom'] = this.node.parent.height - this.node.y + 'px'
          break
        default:
          this.css['top'] = '0px'
          this.css['bottom'] = '0px'
          break
      }
    }
    if (this.css['width']?.endsWith('px') && this.node.parent) {
      if (
        this.node.parent.type === 'SECTION' ||
        this.node.parent.type === 'PAGE' ||
        // inline case
        ('layoutSizingHorizontal' in this.node.parent &&
          this.node.parent.layoutSizingHorizontal == 'HUG')
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
      this.node.type !== 'COMPONENT' &&
      this.node.type !== 'COMPONENT_SET' &&
      'children' in this.node &&
      this.node.children.some(commonIsAbsolutePosition)
    )
      this.additionalProps = {
        pos: 'relative',
        p: '',
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
    await this.run()
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
    await this.run()
    return this.components
  }

  addComponent(node: SceneNode) {
    this.components[toPascal(node.name) + '.tsx'] = async () => {
      return await new Element(node).render()
    }
  }

  async render(): Promise<string> {
    const result = await this.run()

    if (!result) return ''

    if (this.node.type === 'COMPONENT_SET') {
      const componentName = getComponentName(this.node)

      const interfaceDecl = await renderInterfaceFromNode(this.node)
      return `${interfaceDecl ? interfaceDecl + '\n\n' : ''}${renderFunction(componentName, result, !!interfaceDecl)}`
    }
    if (this.node.type === 'COMPONENT') {
      const componentName = getComponentName(this.node)
      const interfaceDecl = await renderInterfaceFromNode(this.node)
      return `${interfaceDecl ? interfaceDecl + '\n\n' : ''}${renderFunction(componentName, result, !!interfaceDecl, this.node.variantProperties)}`
    }
    if (this.node.type === 'INSTANCE') {
      const mainComponent = await this.node.getMainComponentAsync()
      if (mainComponent) {
        return `${render(result)}\n\n/*\n${await new Element(mainComponent).render()}\n*/`
      }
    }

    return render(result)
  }
  filterPropsByChildrenCountAndType(
    componentType: ComponentType,
    props: Record<string, string>,
  ): Record<string, string> {
    const children = this.getChildren()
    const childrenCount = children.length
    if (childrenCount === 1) {
      let fullWidth = false
      let fullHeight = false
      if (children[0] instanceof Element && 'paddingTop' in this.node) {
        fullHeight =
          children[0].node.height >=
          this.node.height - this.node.paddingTop - this.node.paddingBottom
        fullWidth =
          children[0].node.width >=
          this.node.width - this.node.paddingLeft - this.node.paddingRight
      }
      switch (componentType) {
        case 'Center':
          delete props['alignItems']
          delete props['justifyContent']
          delete props['gap']
          break
        case 'VStack':
          if (fullWidth) delete props['alignItems']
          if (fullHeight) delete props['justifyContent']
          delete props['gap']
          break
        case 'Flex':
          if (fullHeight) delete props['alignItems']
          if (fullWidth) delete props['justifyContent']
          delete props['gap']
          break
      }
    }
    return props
  }

  async run(dep: number = 0): Promise<DevupNode | null> {
    if (!this.node.visible) return null

    if (this.node.type === 'COMPONENT_SET') {
      this.addComponent(this.node)
      const defaultVariantProperties =
        this.node.defaultVariant.variantProperties ?? {}
      const hasEffect = Object.keys(
        this.node.componentPropertyDefinitions,
      ).some((prop) => toCamel(prop.split('#')[0]) === 'effect')
      const elements = this.node.children
        .filter((child) => child.type === 'COMPONENT')
        .map((child) => new Element(child))
      if (elements.length === 0) return null
      const defaultElement = new Element(this.node.defaultVariant)
      const defaultEffectElements = hasEffect
        ? elements
            .map((el) => {
              const { variantProperties } = el.node
              const effect = Object.entries(variantProperties!).find(
                ([key, _]) => key.toLowerCase() === 'effect',
              )
              return [effect?.[1], el] as const
            })
            .filter(([effect, el]) => {
              if (effect?.toLowerCase() === 'default') return false
              const { variantProperties } = el.node
              for (const [key, value] of Object.entries(variantProperties!)) {
                if (key.toLowerCase() === 'effect') continue
                const [_, defaultValue] = Object.entries(
                  defaultVariantProperties,
                ).find(([_key, _]) => key.toLowerCase() === _key.toLowerCase())!
                if (defaultValue?.toLowerCase() !== value.toLowerCase())
                  return false
              }
              return true
            })
        : elements.map((el) => [undefined, el] as const)

      const resultInfo = await defaultElement!.run(dep)

      if (hasEffect) {
        const promiseObj: Record<
          string,
          Promise<DevupNode | null>
        > = defaultEffectElements.reduce(
          (acc, el) => {
            acc[toCamel(el[0]!)] = el[1].run(dep)
            return acc
          },
          {} as Record<string, Promise<DevupNode | null>>,
        )
        const resolvedObj: Record<
          string,
          Exclude<DevupNode, string>
        > = Object.fromEntries(
          await Promise.all(
            Object.entries(promiseObj).map(async ([k, v]) => [k, await v]),
          ),
        )
        addSelectorProps(resultInfo!, resolvedObj)
      }
      return resultInfo
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
    const children = this.getChildren()

    const mergedProps = this.filterPropsByChildrenCountAndType(componentType, {
      ...originProps,
      ...this.additionalProps,
    })

    if (this.node.type === 'TEXT') {
      const segs = this.node.getStyledTextSegments(SEGMENT_TYPE)

      // select main color
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

      const children = await Promise.all(
        segs.map(async (seg, idx): Promise<DevupNode | DevupNode[]> => {
          const props = propsArray[idx]
          if (segs.length > 1 && mainColor === props.color) delete props.color
          if (segs.length > 1 && mainTypography === props.typography)
            delete props.typography
          let text: DevupNode | DevupNode[] = fixChildrenText(seg.characters)
          let textComponent: 'ul' | 'ol' | null = null

          if (seg.listOptions.type === 'NONE') {
            text = text.replaceAll('\n', '<br />')
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
            text = text.split('\n').map((line) => ({
              children: [line],
              componentType: 'li',
              props: {},
            }))
          }
          const resultProps = {
            ...props,
            ...(textComponent
              ? { as: textComponent, my: '0px', pl: '1.5em' }
              : {}),
          }
          if (Object.keys(resultProps).length === 0) return text
          return {
            children: Array.isArray(text) ? text : [text],
            componentType: 'Text',
            props: resultProps,
          }
        }),
      )
      const resultChildren = children.flat()
      if (resultChildren.length === 1) return resultChildren[0]

      return {
        children: resultChildren,
        componentType: 'Text',
        props: organizeProps({
          color: mainColor,
          typography: mainTypography,
        }),
      }
    }

    const props = organizeProps(
      propsToComponentProps(mergedProps, componentType, children.length),
    )

    const hasChildren = children.length > 0 && !this.skipChildren

    if (this.node.type === 'INSTANCE' && this.componentType !== 'Image') {
      const children: DevupNode[] = []
      const props = Object.fromEntries(
        Object.entries(this.node.componentProperties)
          .filter(([key, value]) => {
            const lowKey = key.toLowerCase().split('#')[0]
            if (lowKey === 'children') {
              children.push(String(value.value))
              return false
            }
            return lowKey !== 'effect' && lowKey !== 'children'
          })
          .map(([key, value]) => [
            toCamel(key.split('#')[0]),
            value.type === 'INSTANCE_SWAP'
              ? InstanceSymbol
              : typeof value.value === 'string'
                ? toCamel(value.value)
                : value.value,
          ]),
      )
      return {
        children,
        componentType: await getComponentName(this.node),
        props,
      }
    }

    const runChildren = hasChildren
      ? await Promise.all(
          children.map((child) => (child as Element).run(dep + 1)),
        )
      : []
    if (this.node.type === 'COMPONENT') {
      this.addComponent(this.node)
      return {
        children: runChildren.filter(Boolean) as DevupNode[],
        componentType,
        props,
      }
    }
    return {
      children: runChildren.filter(Boolean) as DevupNode[],
      componentType,
      props,
    }
  }
}
