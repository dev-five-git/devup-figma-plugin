import {
  type ComponentPropValue,
  type DevupNode,
  InstanceSymbol,
} from './types'
import { getComponentName, getComponentPropertyType, space } from './utils'
import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

export function render(node: DevupNode, dep: number = 0): string {
  if (typeof node === 'string') return space(dep) + node.trim()

  const { props, children, componentType } = node

  const propsEntries = Object.entries(props)

  const newLineOrder =
    propsEntries.length >= 5 ||
    propsEntries.some(([_, value]) => typeof value === 'object')

  const hasCloseTag = children.length > 0
  let propsString = Object.entries(props)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => {
      const prefixSpace = newLineOrder ? space(dep + 1) : ''
      const props =
        typeof value === 'string'
          ? `${key}="${value}"`
          : value === true
            ? `${key}`
            : value === InstanceSymbol
              ? `${key}={<Instance />}`
              : `${key}={${JSON.stringify(value, null, 2)}}`
      return `${prefixSpace}${props.split('\n').join('\n' + prefixSpace)}`
    })
    .join(newLineOrder ? '\n' : ' ')
  if (newLineOrder) propsString = '\n' + propsString
  else if (propsString) propsString = ' ' + propsString

  const childrenSingleLine =
    children.length <= 1 && typeof children[0] === 'string' && !propsString
  const openTag = `<${componentType}${propsString}${
    newLineOrder ? `\n${space(dep)}` : ''
  }${!hasCloseTag ? (!newLineOrder ? ' />' : '/>') : '>'}`
  const childrenString = children
    .map((child) =>
      childrenSingleLine ? render(child, 0).trim() : render(child, dep + 1),
    )
    .join('\n')

  return `${space(dep)}${openTag}${childrenSingleLine ? '' : '\n'}${childrenString}${
    hasCloseTag
      ? (childrenSingleLine ? '' : `\n${space(dep)}`) + `</${componentType}>`
      : ''
  }`.trimEnd()
}

export function renderFunction(
  componentName: string,
  node: DevupNode,
  hasInterface: boolean,
  defaultProps: Record<string, string> | null = null,
): string {
  const propsEntries = Object.entries(defaultProps ?? {})
  const props =
    propsEntries.length > 0
      ? `{ ${propsEntries
          .filter(
            ([key]) =>
              key.toLowerCase() !== 'children' &&
              key.toLowerCase() !== 'effect',
          )
          .map(([key, value]) => `${toCamel(key)} = "${toCamel(value)}"`)
          .join(', ')} }`
      : 'props'
  const content = render(node)
  const hasNewLine = content.includes('\n')
  return `export function ${componentName}(${hasInterface ? `${props}: ${componentName}Props` : ''}) {
  return ${hasNewLine ? '(\n' : ''}${
    hasNewLine
      ? content
          .split('\n')
          .map((line) => space(2) + line)
          .join('\n')
      : content
  }${hasNewLine ? '\n  )' : ''}
}`
}

export async function renderInterfaceFromNode(
  componentSetNode: ComponentSetNode | ComponentNode,
): Promise<string | null> {
  if (componentSetNode.type === 'COMPONENT') {
    const parent = await componentSetNode.parent
    if (!parent || parent.type !== 'COMPONENT_SET') return null
    return renderInterfaceFromNode(parent)
  }

  const props = componentSetNode.componentPropertyDefinitions
  if (!props || Object.keys(props).length === 0) return null
  return renderInterface(
    toPascal(getComponentName(componentSetNode)),
    getComponentPropertyType(props),
  )
}

export function renderInterface(
  componentName: string,
  props: Record<string, ComponentPropValue>,
): string {
  return `export interface ${componentName}Props {
${Object.entries(props)
  .map(([key, value]) => `  ${key}${value.optional ? '?' : ''}: ${value.type}`)
  .join('\n')}
}`
}
