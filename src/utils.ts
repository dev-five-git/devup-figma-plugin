import { ComponentType } from './Element'
import { toCamel } from './utils/to-camel'

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

const IGNORED_CSS_KEYS = ['display']

export function cssToProps(css: Record<string, string>) {
  const ret: Record<string, string> = {}
  for (const key in css)
    if (!IGNORED_CSS_KEYS.includes(key))
      ret[key in SHORT_ATTR ? SHORT_ATTR[key] : toCamel(key)] = css[key]
  for (const pair of PAIR_ATTR) {
    if (pair.keys.every((key) => ret[key] && ret[key] === ret[pair.keys[0]])) {
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
  if (textStyleId) {
    const style = await figma.getStyleByIdAsync(textStyleId as string)
    if (style) {
      const split = style.name.split('/')
      ret['typography'] = split[split.length - 1]
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
  if (!value.startsWith('var(--')) return value
  const match = value.match(/var\(--(\w+)/)
  return '$' + match?.[1]
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
      delete ret['fill']
      break
    case 'Image':
      delete ret['alignItems']
      delete ret['justifyContent']
      delete ret['gap']
      delete ret['fill']
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
const COLOR_PROPS = ['color', 'bg', 'borderColor']
const SPACE_PROPS = ['m', 'p']
const DEFAULT_PROPS_MAP = {
  flex: {
    default: '1 0 0',
    value: '1',
  },
  p: {
    default: '0px',
    value: null,
  },
  m: {
    default: '0px',
    value: null,
  },
} as const

const CONVERT_PROPS_MAP = {
  p: [
    {
      test: /^0px (\d*[1-9]|\d{2,})px$/,
      value: {
        prop: 'px',
        value: (value: string) => value.split(' ')[1],
      },
    },
    {
      test: /^(\d*[1-9]|\d{2,})px 0px$/,
      value: {
        prop: 'py',
        value: (value: string) => value.split(' ')[0],
      },
    },
  ],
  m: [
    {
      test: /^0px (\d*[1-9]|\d{2,})px$/,
      value: {
        prop: 'mx',
        value: (value: string) => value.split(' ')[1],
      },
    },
    {
      test: /^(\d*[1-9]|\d{2,})px 0px$/,
      value: {
        prop: 'my',
        value: (value: string) => value.split(' ')[0],
      },
    },
  ],
} as const

const CONVERT_PROPS_VALUE_MAP = {
  bg: [
    {
      test: /url\(<path-to-image>\)/,
      value: (value: string) =>
        value.replace(/url\(<path-to-image>\)/, 'url(/path/to/image)'),
    },
  ],
}
export function organizeProps(props: Record<string, string>) {
  const ret = { ...props }
  for (const key of COLOR_PROPS)
    if (ret[key]) ret[key] = extractVariableName(ret[key])
  for (const key of SPACE_PROPS)
    if (ret[key]) ret[key] = shortSpaceValue(ret[key])

  for (const key in DEFAULT_PROPS_MAP)
    if (
      ret[key] ===
      DEFAULT_PROPS_MAP[key as keyof typeof DEFAULT_PROPS_MAP].default
    ) {
      const defaultValue =
        DEFAULT_PROPS_MAP[key as keyof typeof DEFAULT_PROPS_MAP].value

      if (defaultValue === null) delete ret[key]
      else ret[key] = defaultValue
    }

  for (const key in PROPS_DEFAULT)
    if (ret[key] === PROPS_DEFAULT[key as keyof typeof PROPS_DEFAULT])
      delete ret[key]
  for (const key in CONVERT_PROPS_MAP) {
    if (!ret[key]) continue
    for (const convert of CONVERT_PROPS_MAP[
      key as keyof typeof CONVERT_PROPS_MAP
    ]) {
      if (convert.test.test(ret[key])) {
        const { prop, value } = convert.value
        ret[prop] = value(ret[key])
        delete ret[key]
        break
      }
    }
  }
  for (const key in ret) {
    if (ret[key] === '') {
      delete ret[key]
    }
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
  return ret
}

function shortSpaceValue(value: string) {
  const split = value.split(' ')
  if (split.every((v) => v === split[0])) return split[0]
  if (split.length === 4 && split[1] === split[3] && split[0] === split[2])
    return `${split[0]} ${split[1]}`
  if (split.length === 4 && split[1] === split[3])
    return `${split[0]} ${split[1]} ${split[2]}`
  return value
}

export async function checkImageChildrenType(
  node: SceneNode & ChildrenMixin,
): Promise<{ type: 'SVG' | 'IMAGE'; fill?: string } | null> {
  const children = node.children
  let hasSVG = false
  let fill: undefined | string = undefined

  for (const child of children) {
    if (
      child.type === 'ELLIPSE' ||
      child.type === 'RECTANGLE' ||
      child.type === 'POLYGON' ||
      child.type === 'STAR' ||
      child.type === 'VECTOR' ||
      child.type === 'LINE'
    ) {
      const css = await child.getCSSAsync()
      if (css['fill'] && css['fill'].startsWith('var(--')) fill = css['fill']
      hasSVG = true
      continue
    }
    if (
      child.type === 'FRAME' ||
      child.type === 'GROUP' ||
      child.type === 'BOOLEAN_OPERATION' ||
      child.type === 'INSTANCE'
    ) {
      const retType = (await checkImageChildrenType(child))?.type
      if (retType) hasSVG = true
      else return null
      continue
    }
    return null
  }
  if (hasSVG && fill)
    return {
      type: 'SVG',
      fill,
    }
  if (hasSVG)
    return {
      type: 'IMAGE',
    }
  return null
}
