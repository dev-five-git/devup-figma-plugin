import type { ComponentPropValue, ComponentType, DevupNode } from './types'
import { optimizeHex } from './utils/optimize-hex'
import { optimizeRgbaFunc } from './utils/optimize-rgba-func'
import { rgbaToHex } from './utils/rgba-to-hex'
import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

const PROPS_DEFAULT = {
  alignItems: 'flex-start',
  alignSelf: 'stretch',
  flexShrink: '0',
}

const SHORT_ATTR: Record<string, string> = {
  background: 'bg',
  'background-attachment': 'bgAttachment',
  'background-clip': 'bgClip',
  'background-color': 'bgColor',
  'background-image': 'bgImage',
  'background-origin': 'bgOrigin',
  'background-position': 'bgPosition',
  'background-position-x': 'bgPositionX',
  'background-position-y': 'bgPositionY',
  'background-repeat': 'bgRepeat',
  'background-size': 'bgSize',
  'animation-direction': 'animationDir',
  'flex-direction': 'flexDir',
  position: 'pos',
  margin: 'm',
  'margin-top': 'mt',
  'margin-right': 'mr',
  'margin-bottom': 'mb',
  'margin-left': 'ml',
  padding: 'p',
  'padding-top': 'pt',
  'padding-right': 'pr',
  'padding-bottom': 'pb',
  'padding-left': 'pl',
  width: 'w',
  height: 'h',
  'min-width': 'minW',
  'min-height': 'minH',
  'max-width': 'maxW',
  'max-height': 'maxH',
}
const PAIR_ATTR = [
  {
    keys: ['ml', 'mr', 'mb', 'mt'],
    short: 'm',
  },
  {
    keys: ['ml', 'mr'],
    short: 'mx',
  },
  {
    keys: ['mt', 'mb'],
    short: 'my',
  },
  {
    keys: ['pl', 'pr', 'pb', 'pt'],
    short: 'p',
  },
  {
    keys: ['pl', 'pr'],
    short: 'px',
  },
  {
    keys: ['pt', 'pb'],
    short: 'py',
  },
  {
    keys: ['w', 'h'],
    short: 'boxSize',
  },
]
const CLEAR_ATTR = {
  boxSize: ['w', 'h'],
}

const IGNORED_CSS_KEYS = ['display']

function equalAttributeValue(a: any, b: any) {
  if (a === b) return true
  // check same suffix
  const aa = parseFloat(a)
  const bb = parseFloat(b)
  if (
    a.slice(aa.toString().length - a.length) !==
    b.slice(bb.toString().length - b.length)
  )
    return false
  return Math.abs(aa - bb) < 0.0001
}

export function cssToProps(css: Record<string, string>) {
  const ret: Record<string, string> = {}
  for (const key in css)
    if (!IGNORED_CSS_KEYS.includes(key)) {
      let newKey = key in SHORT_ATTR ? SHORT_ATTR[key] : toCamel(key)
      if (newKey.startsWith('webkit'))
        newKey = newKey.replace('webkit', 'Webkit')
      ret[newKey] = css[key]
    }
  for (const pair of PAIR_ATTR) {
    if (
      pair.keys.every(
        (key) => ret[key] && equalAttributeValue(ret[key], ret[pair.keys[0]]),
      )
    ) {
      ret[pair.short] = ret[pair.keys[0]]
      pair.keys.forEach((key) => delete ret[key])
    }
  }
  return ret
}

export async function propsToPropsWithTypography(
  props: Record<string, string>,
  textStyleId: TextNode['textStyleId'],
) {
  const ret: Record<string, string> = { ...props }
  delete ret['w']
  delete ret['h']
  if (typeof textStyleId === 'string' && textStyleId) {
    const style = await figma.getStyleByIdAsync(textStyleId as string)
    if (style) {
      const split = style.name.split('/')
      ret['typography'] = toCamel(split[split.length - 1])
      delete ret['fontFamily']
      delete ret['fontSize']
      delete ret['fontWeight']
      delete ret['fontStyle']
      delete ret['letterSpacing']
      delete ret['lineHeight']
    }
  }
  return ret
}

export function space(depth: number) {
  return ' '.repeat(depth * 2)
}

function extractVariableName(value: string) {
  const match = value.match(/var\(--([\w-]+)/)
  // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
  return '$' + toCamel(match?.[1].split(',')[0].trim()!)
}

function extractVariableValue(value: string) {
  const match = value.match(/var\(--([\w-]+), (.*)\)/)

  return match![2]
}

export function propsToComponentProps(
  props: Record<string, string>,
  componentType: ComponentType,
  childrenLength: number,
) {
  if (childrenLength <= 1) {
    delete props['flexDir']
  }
  const ret = { ...props }
  switch (componentType) {
    case 'Box':
      if (ret['fill']) {
        ret['bg'] = ret['fill']
        delete ret['fill']
      }
      break
    case 'Image':
      delete ret['alignItems']
      delete ret['justifyContent']
      delete ret['gap']
      delete ret['fill']
      delete ret['p']
      break
    case 'Flex':
    case 'Button':
    case 'Input':
    case 'Grid':
    case 'Text':
      break
    case 'Center':
      delete ret['alignItems']
      delete ret['justifyContent']
      break
    case 'VStack':
      delete ret['flexDir']
      break
  }
  return ret
}
const COLOR_PROPS = [
  'accentColor',
  'background',
  'bg',
  'backgroundColor',
  'bgColor',
  'border',
  'borderBlockEnd',
  'borderBlockStart',
  'borderBottom',
  'borderColor',
  'borderInlineEnd',
  'borderInlineStart',
  'borderLeft',
  'borderLeftColor',
  'borderRight',
  'borderRightColor',
  'borderTop',
  'borderTopColor',
  'caret-color',
  'color',
  'columnRuleColor',
  'floodColor',
  'fill',
  'lightingColor',
  'outlineColor',
  'scrollbarColor',
  'strokeColor',
  'textDecorationColor',
  'textEmphasisColor',
]
const DEFAULT_PROPS_MAP = {
  flex: {
    default: /1 0 0/,
    value: '1',
  },
  p: {
    default: /\b0(px)?\b/,
    value: null,
  },
  pr: {
    default: /\b0(px)?\b/,
    value: null,
  },
  pt: {
    default: /\b0(px)?\b/,
    value: null,
  },
  pb: {
    default: /\b0(px)?\b/,
    value: null,
  },
  px: {
    default: /\b0(px)?\b/,
    value: null,
  },
  py: {
    default: /\b0(px)?\b/,
    value: null,
  },
  pl: {
    default: /\b0(px)?\b/,
    value: null,
  },
  m: {
    default: /\b0(px)?\b/,
    value: null,
  },
  mt: {
    default: /\b0(px)?\b/,
    value: null,
  },
  mb: {
    default: /\b0(px)?\b/,
    value: null,
  },
  mr: {
    default: /\b0(px)?\b/,
    value: null,
  },
  ml: {
    default: /\b0(px)?\b/,
    value: null,
  },
  mx: {
    default: /\b0(px)?\b/,
    value: null,
  },
  my: {
    default: /\b0(px)?\b/,
    value: null,
  },
  textDecorationSkipInk: {
    default: /\bauto\b/,
    value: null,
  },
  textDecorationThickness: {
    default: /\bauto\b/,
    value: null,
  },
  textDecorationStyle: {
    default: /\bsolid\b/,
    value: null,
  },
  textDecorationColor: {
    default: /\bauto\b/,
    value: null,
  },
  textUnderlineOffset: {
    default: /\bauto\b/,
    value: null,
  },
} as const

const CONVERT_PROPS_MAP = {
  p: [
    {
      test: /^(\d+)px \1px( \1px)?( \1px)?$/,
      value: [
        {
          prop: 'p',
          value: (value: string) => value.split(' ')[0],
        },
      ],
    },
    {
      test: /^0(px)? (\d*[1-9]|\d{2,})px$/,
      value: {
        prop: 'px',
        value: (value: string) => value.split(' ')[1],
      },
    },
    {
      test: /^(\d*[1-9]|\d{2,})px 0(px)?$/,
      value: {
        prop: 'py',
        value: (value: string) => value.split(' ')[0],
      },
    },
    {
      test: /^(\d*[1-9]|\d{2,})px (\d*[1-9]|\d{2,})px$/,
      value: [
        {
          prop: 'py',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'px',
          value: (value: string) => value.split(' ')[1],
        },
      ],
    },
    {
      test: /^\d+px \d+px \d+px$/,
      value: [
        {
          prop: 'px',
          value: (value: string) => value.split(' ')[1],
        },
        {
          prop: 'pt',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'pb',
          value: (value: string) => value.split(' ')[2],
        },
      ],
    },
    {
      test: /^(\d+)px (\d+)px \1px \2px$/,
      value: [
        {
          prop: 'py',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'px',
          value: (value: string) => value.split(' ')[1],
        },
      ],
    },
    {
      test: /^(\d+)px (\d+)px \d+px \2px$/,
      value: [
        {
          prop: 'pt',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'pb',
          value: (value: string) => value.split(' ')[2],
        },
        {
          prop: 'px',
          value: (value: string) => value.split(' ')[1],
        },
      ],
    },
    {
      test: /^(\d+)px \d+px \1px \d+px$/,
      value: [
        {
          prop: 'py',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'pr',
          value: (value: string) => value.split(' ')[1],
        },
        {
          prop: 'pl',
          value: (value: string) => value.split(' ')[3],
        },
      ],
    },
  ],
  m: [
    {
      test: /^(\d+)px \1px( \1px)?( \1px)?$/,
      value: [
        {
          prop: 'm',
          value: (value: string) => value.split(' ')[0],
        },
      ],
    },
    {
      test: /^0(px)? (\d*[1-9]|\d{2,})px$/,
      value: {
        prop: 'mx',
        value: (value: string) => value.split(' ')[1],
      },
    },
    {
      test: /^(\d*[1-9]|\d{2,})px 0(px)?$/,
      value: {
        prop: 'my',
        value: (value: string) => value.split(' ')[0],
      },
    },
    {
      test: /^(\d*[1-9]|\d{2,})px (\d*[1-9]|\d{2,})px$/,
      value: [
        {
          prop: 'my',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'mx',
          value: (value: string) => value.split(' ')[1],
        },
      ],
    },
    {
      test: /^\d+px \d+px \d+px$/,
      value: [
        {
          prop: 'mx',
          value: (value: string) => value.split(' ')[1],
        },
        {
          prop: 'mt',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'mb',
          value: (value: string) => value.split(' ')[2],
        },
      ],
    },
    {
      test: /^(\d+)px (\d+)px \1px \2px$/,
      value: [
        {
          prop: 'my',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'mx',
          value: (value: string) => value.split(' ')[1],
        },
      ],
    },
    {
      test: /^(\d+)px (\d+)px \d+px \2px$/,
      value: [
        {
          prop: 'mt',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'mb',
          value: (value: string) => value.split(' ')[2],
        },
        {
          prop: 'mx',
          value: (value: string) => value.split(' ')[1],
        },
      ],
    },
    {
      test: /^(\d+)px \d+px \1px \d+px$/,
      value: [
        {
          prop: 'my',
          value: (value: string) => value.split(' ')[0],
        },
        {
          prop: 'mr',
          value: (value: string) => value.split(' ')[1],
        },
        {
          prop: 'ml',
          value: (value: string) => value.split(' ')[3],
        },
      ],
    },
  ],
}

const CONVERT_PROPS_VALUE_MAP = {
  bg: [
    {
      test: /url\(<path-to-image>\)/,
      value: (value: string) =>
        value.replace(/url\(<path-to-image>\)/, 'url(/path/to/image)'),
    },
  ],
  aspectRatio: [
    {
      test: /^(\d+)\/\1$/,
      value: (value: string) => value.split('/')[0],
    },
  ],
}

function replaceAllVarFunctions(
  str: string,
  replacer: (v: string) => string,
): string {
  let result = ''
  let i = 0
  while (i < str.length) {
    const varStart = str.indexOf('var(', i)
    if (varStart === -1) {
      result += str.slice(i)
      break
    }
    result += str.slice(i, varStart)
    let open = 1
    let end = varStart + 4
    for (; end < str.length; end++) {
      if (str[end] === '(') open++
      if (str[end] === ')') open--
      if (open === 0) break
    }
    const varContent = str.slice(varStart, end + 1)
    result += replacer(varContent)
    i = end + 1
  }
  return result
}

export function organizeProps(props: Record<string, string>) {
  const ret = { ...props }
  for (const key of COLOR_PROPS)
    if (ret[key])
      ret[key] = optimizeHex(
        optimizeRgbaFunc(replaceAllVarFunctions(ret[key], extractVariableName)),
      )

  for (const key in PROPS_DEFAULT)
    if (ret[key] === PROPS_DEFAULT[key as keyof typeof PROPS_DEFAULT])
      delete ret[key]
  for (const key in CONVERT_PROPS_MAP) {
    if (!ret[key]) continue
    for (const convert of CONVERT_PROPS_MAP[
      key as keyof typeof CONVERT_PROPS_MAP
    ]) {
      if (convert.test.test(ret[key])) {
        const convertValue = Array.isArray(convert.value)
          ? convert.value
          : [convert.value]
        for (const convert of convertValue) {
          const { prop, value } = convert
          ret[prop] = value(ret[key])
        }
        if (!convertValue.map((c) => c.prop).includes(key)) delete ret[key]
        break
      }
    }
  }
  for (const key in ret) {
    if (!ret[key]) {
      delete ret[key]
      continue
    }
    if (ret[key].includes('0px')) ret[key] = ret[key].replace(/\b0px\b/g, '0')
    if (ret[key].startsWith('"') && ret[key].endsWith('"'))
      ret[key] = ret[key].slice(1, -1)
    if (ret[key].includes('/*')) ret[key] = ret[key].split('/*')[0].trim()
    if (ret[key].includes('var(--'))
      // extract pure value from var
      ret[key] = replaceAllVarFunctions(ret[key], extractVariableValue)
  }
  for (const key in CONVERT_PROPS_VALUE_MAP) {
    if (!ret[key]) continue
    for (const convert of CONVERT_PROPS_VALUE_MAP[
      key as keyof typeof CONVERT_PROPS_VALUE_MAP
    ]) {
      if (convert.test.test(ret[key])) {
        ret[key] = convert.value(ret[key])
        break
      }
    }
  }
  for (const key in CLEAR_ATTR) {
    if (!ret[key]) continue
    for (const clear of CLEAR_ATTR[key as keyof typeof CLEAR_ATTR]) {
      delete ret[clear]
    }
  }

  for (const key in DEFAULT_PROPS_MAP)
    if (
      DEFAULT_PROPS_MAP[key as keyof typeof DEFAULT_PROPS_MAP].default.test(
        ret[key],
      )
    ) {
      const defaultValue =
        DEFAULT_PROPS_MAP[key as keyof typeof DEFAULT_PROPS_MAP].value

      if (defaultValue === null) delete ret[key]
      else ret[key] = defaultValue
    }

  if (ret['aspectRatio'] === '1' && !!ret['w'] !== !!ret['h']) {
    ret['boxSize'] = ret['h'] || ret['w']
    delete ret['w']
    delete ret['h']
  }
  return ret
}

export async function checkSvgImageChildrenType(
  node: SceneNode & ChildrenMixin,
): Promise<
  { type: 'SVG'; fill: Set<string> } | { type: 'IMAGE' } | null | false
> {
  const children = node.children
  let hasSVG = false
  const fill: Set<string> = new Set()
  let allOfRect = true

  for (const child of children) {
    if (child.type === 'TEXT') {
      // if Element has Text, it must not be an icon
      return false
    }
    if (child.type === 'RECTANGLE') {
      if ((child.fills as any).find((fill: any) => fill.type === 'IMAGE')) {
        return null
      }
      continue
    }
    allOfRect = false
    if (
      child.type === 'ELLIPSE' ||
      child.type === 'POLYGON' ||
      child.type === 'STAR' ||
      child.type === 'VECTOR' ||
      child.type === 'LINE'
    ) {
      const css = await child.getCSSAsync()
      if (css['fill'] && css['fill'].startsWith('var(--')) {
        fill.add(css['fill'])
      }
      hasSVG = true
      continue
    }
    if (
      child.type === 'BOOLEAN_OPERATION' ||
      child.type === 'INSTANCE' ||
      child.type === 'FRAME' ||
      child.type === 'GROUP'
    ) {
      const res = await checkSvgImageChildrenType(child)
      if (res === false) return false
      if (res?.type) hasSVG = true
      continue
    }
  }
  if (!allOfRect && hasSVG && fill)
    return {
      type: 'SVG',
      fill,
    }
  if (allOfRect && children.length > 1)
    return {
      type: 'SVG',
      fill,
    }
  return null
}

export function formatSvg(svg: string, dep: number = 0) {
  let depCount = 0
  return svg
    .split('\n')
    .map((line) => {
      if (line.startsWith('</')) depCount--
      const ret = space(dep + depCount) + line
      if (!line.startsWith('</') && !line.endsWith('/>')) depCount++
      return ret
    })
    .join('\n')
    .trimEnd()
}
export function fixChildrenText(children: string) {
  return children
    .replace(/([{}&<>]+)/g, '{"$1"}')
    .replace(/(^\s+)|(\s+$)/g, (match) => `{"${' '.repeat(match.length)}"}`)
}
export function getComponentName(node: SceneNode) {
  if (node.type === 'COMPONENT_SET') return toPascal(node.name)
  if (node.type === 'COMPONENT')
    return toPascal(
      node.parent?.type === 'COMPONENT_SET' ? node.parent.name : node.name,
    )
  return toPascal(node.name)
}

export function addSelectorProps(
  node: DevupNode,
  selectorNode: Record<string, Exclude<DevupNode, string>>,
) {
  if (typeof node === 'string') return
  const result: string[] = []
  for (const [key, value] of Object.entries(selectorNode)) {
    const filteredProps = Object.entries(value.props).filter(([key, value]) => {
      if (node.props[key] === value) return false
      return true
    })
    if (filteredProps.length > 0)
      node.props['_' + toCamel(key)] = Object.fromEntries(filteredProps)
  }
  node.children.forEach((child, idx) => {
    const tmp: Record<string, Exclude<DevupNode, string>> = {}
    for (const [key, value] of Object.entries(selectorNode)) {
      tmp[key] = value.children[idx] as Exclude<DevupNode, string>
    }
    addSelectorProps(child, tmp)
  })
  return result
}

export function getComponentPropertyType(
  definitions: ComponentPropertyDefinitions,
): Record<string, ComponentPropValue> {
  const ret: Record<string, ComponentPropValue> = {}
  for (const [key, value] of Object.entries(definitions)) {
    const propertyKey = toCamel(key.split('#')[0])

    if (propertyKey === 'children') {
      ret[propertyKey] = {
        type: 'React.ReactNode',
        optional: !!value.defaultValue,
        defaultValue: '',
      }
      continue
    }
    if (propertyKey === 'effect') continue

    switch (value.type) {
      case 'BOOLEAN':
        ret[propertyKey] = {
          type: 'boolean',
          optional: !!value.defaultValue,
          defaultValue: value.defaultValue,
        }
        break
      case 'TEXT':
        ret[propertyKey] = {
          type: 'string',
          optional: !!value.defaultValue,
          defaultValue: value.defaultValue,
        }
        break
      case 'INSTANCE_SWAP':
        ret[propertyKey] = {
          type: 'React.ReactNode',
          optional: !!value.defaultValue,
          defaultValue: value.defaultValue,
        }
        break
      case 'VARIANT':
        ret[propertyKey] = {
          type:
            value.variantOptions?.map((v) => `'${toCamel(v)}'`).join(' | ') ||
            'string',
          optional: !!value.defaultValue,
          defaultValue: value.defaultValue,
        }
        break
    }
  }
  return ret
}

export const colorFromFills = async (
  fills:
    | ReadonlyArray<
        Paint & {
          boundVariables?: { color: VariableAlias }
          color?: RGB
        }
      >
    | undefined,
): Promise<string> => {
  const fill = fills?.find((fill) => fill.visible)
  if (fill && fill.color) {
    if (fill.boundVariables?.color?.id) {
      const variable = await figma.variables.getVariableByIdAsync(
        fill.boundVariables.color.id as string,
      )
      if (variable?.name) return `$${variable.name}`
    }

    return rgbaToHex(figma.util.rgba(fill.color))
  }
  return ''
}
