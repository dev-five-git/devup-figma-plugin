import { Element } from './Element'

interface RenderOptions {
  depth?: number
}

export function render(
  element: Element,
  { depth = 0 }: RenderOptions = {},
): string {
  const open = `<${element.type}`
  const hasChildren =
    element.children.length > 0 || (element.text?.length ?? 0) > 0
  const close = hasChildren ? `\n${depthSpace(depth)}</${element.type}>` : '/>'
  const children: string[] = []
  for (let i = 0; i < element.children.length; i++) {
    const child = element.children[i]
    if (i + 1 < element.children.length) {
      const next = element.children[i + 1]
      if (
        next.props.position === 'absolute' &&
        element.props.position !== 'relative'
      ) {
        children.push(
          render(
            {
              children: [child, next],
              props: {
                position: 'relative',
                w: element.type === 'Flex' ? '100%' : undefined,
              },
              type: 'Box',
            },
            {
              depth: depth + 1,
            },
          ),
        )
        i++
        continue
      }
    }
    children.push(render(child, { depth: depth + 1 }))
  }
  if (children.length <= 1) delete element.props.gap
  const propsString = attributesToString(element.props)
  return (
    depthSpace(depth) +
    open +
    (propsString ? ' ' + propsString : '') +
    (hasChildren ? '>\n' : '') +
    (element.text ? depthSpace(depth + 1) + element.text : '') +
    children.join('\n') +
    close
  )
}
function depthSpace(deps: number) {
  return ' '.repeat(deps * 2)
}
const STYLE_PROPS = ['left', 'top', 'right', 'bottom', 'position', 'filter']
function attributesToString(
  attrs: Record<string, string | object | undefined>,
) {
  const style: Record<string, string | object> = {}
  for (const key of STYLE_PROPS) {
    if (attrs[key]) {
      style[key] = attrs[key]
      delete attrs[key]
    }
  }
  if (Object.keys(style).length > 0) {
    attrs.style = style
  }
  return Object.entries(attrs)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? JSON.stringify(value) : '{' + JSON.stringify(value) + '}'}`,
    )
    .join(' ')
}
