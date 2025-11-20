import { space } from '../../utils'
import { filterPropsWithComponent } from '../props'
import { isDefaultProp } from '../utils/is-default-prop'
import { paddingLeftMultiline } from '../utils/padding-left-multiline'
import { propsToString } from '../utils/props-to-str'

export function renderNode(
  component: string,
  props: Record<string, number | null | string | boolean | undefined | object>,
  deps: number = 0,
  childrenCodes: string[],
): string {
  console.log('renderNode', props)
  const filteredProps = filterProps(props)

  console.log('filteredProps', filteredProps)
  const propsString = propsToString(
    filterPropsWithComponent(component, filteredProps),
  )
  const hasChildren = childrenCodes.length > 0
  const tail = hasChildren ? space(deps) + `</${component}>` : ''
  const multiProps = propsString.includes('\n')
  return [
    `${space(deps)}<${component}${propsString ? (multiProps ? `\n${paddingLeftMultiline(propsString, deps + 1)}` : ` ${propsString}`) : ''}${
      (multiProps ? '\n' + space(deps) : !hasChildren ? ' ' : '') +
      (hasChildren ? '>' : '/>')
    }`,
    hasChildren
      ? childrenCodes
          .map(
            (child) =>
              space(deps + 1) + child.split('\n').join('\n' + space(deps + 1)),
          )
          .join('\n')
      : '',
    tail,
  ]
    .filter(Boolean)
    .join('\n')
}

export function renderComponent(
  component: string,
  code: string,
  variants: Record<string, string>,
) {
  const hasVariants = Object.keys(variants).length > 0
  const interfaceCode = hasVariants
    ? `export interface ${component}Props {
  ${Object.entries(variants)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}
}\n\n`
    : ''
  return `${interfaceCode}export function ${component}() {
  return ${
    code.includes('\n')
      ? `(\n${code
          .split('\n')
          .map((line) => line)
          .join('\n')}\n${space(1)})`
      : code
  }
 }`
}

function filterProps(props: Record<string, unknown>) {
  const newProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      continue
    }
    const newValue = typeof value === 'number' ? String(value) : value
    if (isDefaultProp(key, newValue)) {
      continue
    }
    newProps[key] = newValue
  }
  return newProps
}
