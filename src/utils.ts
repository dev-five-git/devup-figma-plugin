import { Element } from './Element'

export async function createCode(node: SceneNode): Promise<Element> {
  const css = await node.getCSSAsync()
  const children = getChildren(node)
  const text = node.type === 'TEXT' ? node.characters : ''

  const component = selectComponent(node, css)

  const attrs = await applySpecialAttributes(
    node,
    component,
    createAttributes(css),
    children,
  )
  if (
    (node.type === 'INSTANCE' ||
      node.type === 'FRAME' ||
      node.type === 'COMPONENT') &&
    children.length &&
    children.every(
      (child) =>
        child.type === 'VECTOR' ||
        child.type === 'ELLIPSE' ||
        child.type === 'RECTANGLE' ||
        child.type === 'BOOLEAN_OPERATION',
    )
  ) {
    return {
      props: { ...attrs, src: node.name },
      children: [],
      type: 'Image',
    }
  }
  return {
    text,
    props: attrs,
    children: await Promise.all(children.map(createCode)),
    type: component,
  }
}

function getChildren(node: SceneNode) {
  if ('children' in node) return node.children
  return []
}

const IGNORE_ATTRS = ['display']

function selectComponent(node: SceneNode, css: Record<string, string>) {
  const type = node.type
  if (type === 'VECTOR') return 'Image'
  if (type === 'TEXT') return 'Text'
  if (type === 'RECTANGLE') {
    if ((node.fills as ReadonlyArray<Paint>).length > 0) {
      const firstFill = (node.fills as ReadonlyArray<Paint>)[0]
      if (firstFill.type === 'IMAGE') return 'Image'
    }
  }
  const display = css.display
  switch (display) {
    case 'flex':
    case 'inline-flex':
      if (css['flex-direction'] === 'column') {
        delete css['flex-direction']
        return 'VStack'
      }
      return 'Flex'
    default:
      return 'Box'
  }
}
function createAttributes(css: Record<string, string>) {
  const res: Record<string, string> = {}
  for (const [key, value] of Object.entries(css)) {
    const attr = convertAttributeName(key)
    if (IGNORE_ATTRS.includes(attr)) continue
    res[attr] = normalizeValue(value)
  }
  return res
}
const ATTRS_DEFAULT = {
  alignItems: 'flex-start',
  alignSelf: 'stretch',
  flexShrink: '0',
}
async function applySpecialAttributes(
  node: SceneNode,
  component: string,
  attrs: Record<string, string>,
  children: readonly SceneNode[],
) {
  if (node.type === 'TEXT') {
    if (node.textStyleId) {
      const style = await figma.getStyleByIdAsync(node.textStyleId as string)
      if (style) {
        const split = style.name.split('/')
        attrs['typography'] = split[split.length - 1]
        delete attrs['fontFamily']
        delete attrs['fontSize']
        delete attrs['fontWeight']
        delete attrs['fontStyle']
        delete attrs['letterSpacing']
        delete attrs['lineHeight']
      }
    }
  }

  if (component === 'Image') {
    delete attrs['bg']
    delete attrs['fill']
  }
  if (component === 'Box' || component === 'Flex' || component === 'VStack') {
    if (attrs['fill']) {
      attrs['bg'] = attrs['fill']
      delete attrs['fill']
    }
  }
  if (attrs['gap'] && attrs['justifyContent']) delete attrs['justifyContent']
  if (attrs['h'] && attrs['w'] === attrs['h']) {
    attrs['boxSize'] = attrs['w']
    delete attrs['w']
    delete attrs['h']
  }
  if (node.boundVariables?.fills) {
    const fill = node.boundVariables.fills[0]
    if (fill.type === 'VARIABLE_ALIAS') {
      const name = (await figma.variables.getVariableByIdAsync(fill.id))?.name

      if (name) {
        if (component === 'Text' && name === 'text') delete attrs['color']
        else attrs[component === 'Text' ? 'color' : 'bg'] = `$${name}`
      }
    }
  }
  if (children.length <= 1) delete attrs['gap']

  for (const [key, value] of Object.entries(ATTRS_DEFAULT)) {
    if (key in attrs && attrs[key] === value) {
      delete attrs[key]
    }
  }
  const borderRegex = /var\(--(\w+), #\w+\)/
  for (const key of Object.keys(attrs)) {
    if (key.startsWith('border') && borderRegex.test(attrs[key])) {
      attrs['borderColor'] = '$' + attrs[key].match(borderRegex)![1]
      attrs[key] = attrs[key].replace(borderRegex, '')
      delete attrs[key]
    }
  }
  return attrs
}

function normalizeValue(value: string) {
  return value.split('/*')[0].trim()
}
const ATTR_MAP: Record<string, string> = {
  width: 'w',
  height: 'h',
  padding: 'p',
  margin: 'm',
  flexDirection: 'flexDir',
  // justifyContent: 'justify',
  // alignItems: 'align',
  marginTop: 'mt',
  marginBottom: 'mb',
  marginLeft: 'ml',
  marginRight: 'mr',
  paddingTop: 'pt',
  paddingBottom: 'pb',
  paddingLeft: 'pl',
  paddingRight: 'pr',
  background: 'bg',
}
function convertAttributeName(attr: string) {
  const jsonKey = camelCase(attr)
  if (jsonKey in ATTR_MAP) return ATTR_MAP[jsonKey]
  return jsonKey
}
function camelCase(str: string) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
}
