import { space } from '../../utils'
import { isDefaultProp } from '../utils/is-default-prop'
import {
  paddingLeftMultiline,
  wrapReturnStatement,
} from '../utils/padding-left-multiline'
import { propsToString } from '../utils/props-to-str'

const CENTER_SKIP_KEYS = new Set(['alignItems', 'justifyContent'])
const IMAGE_BOX_SKIP_KEYS = new Set([
  'alignItems',
  'justifyContent',
  'flexDir',
  'gap',
  'outline',
  'outlineOffset',
  'overflow',
])

export function renderNode(
  component: string,
  props: Record<string, unknown>,
  deps: number = 0,
  childrenCodes: string[],
): string {
  const propsString = propsToString(filterAndTransformProps(component, props))
  const hasChildren = childrenCodes.length > 0
  const multiProps = propsString.includes('\n')
  let result = `${space(deps)}<${component}${propsString ? (multiProps ? `\n${paddingLeftMultiline(propsString, deps + 1)}` : ` ${propsString}`) : ''}${
    (multiProps ? `\n${space(deps)}` : !hasChildren ? ' ' : '') +
    (hasChildren ? '>' : '/>')
  }`
  if (hasChildren) {
    const children = childrenCodes
      .map((child) => paddingLeftMultiline(child, deps + 1))
      .join('\n')
    result += `\n${children}\n${space(deps)}</${component}>`
  }
  return result
}

export function renderComponent(
  component: string,
  code: string,
  variants: Record<string, string>,
) {
  // Single pass: collect variant entries, skipping 'effect' (reserved key)
  const variantEntries: [string, string][] = []
  for (const key in variants) {
    if (key.toLowerCase() !== 'effect')
      variantEntries.push([key, variants[key]])
  }
  if (variantEntries.length === 0) {
    return `export function ${component}() {
  return ${wrapReturnStatement(code, 1)}
}`
  }
  const interfaceLines: string[] = []
  const keys: string[] = []
  for (const [key, value] of variantEntries) {
    const optional = value === 'boolean' ? '?' : ''
    interfaceLines.push(`  ${key}${optional}: ${value}`)
    keys.push(key)
  }
  return `export interface ${component}Props {
${interfaceLines.join('\n')}
}

export function ${component}({ ${keys.join(', ')} }: ${component}Props) {
  return ${wrapReturnStatement(code, 1)}
}`
}

function filterAndTransformProps(
  component: string,
  props: Record<string, unknown>,
) {
  const hasMaskImage = 'maskImage' in props
  const newProps: Record<string, unknown> = {}
  for (const key in props) {
    const value = props[key]
    if (value === null || value === undefined) {
      continue
    }
    const newValue = typeof value === 'number' ? String(value) : value
    if (isDefaultProp(key, newValue)) {
      continue
    }
    switch (component) {
      case 'Flex':
        if (key === 'display' && newValue === 'flex') continue
        if (key === 'flexDir' && newValue === 'row') continue
        break
      case 'Grid':
        if (key === 'display' && newValue === 'grid') continue
        break
      case 'Center':
        if (CENTER_SKIP_KEYS.has(key)) continue
        if (key === 'display' && newValue === 'flex') continue
        if (key === 'flexDir' && newValue === 'row') continue
        break
      case 'VStack':
        if (key === 'flexDir' && newValue === 'column') continue
        if (key === 'display' && newValue === 'flex') continue
        break
      case 'Image':
      case 'Box':
        if (component === 'Box' && !hasMaskImage) break
        if (IMAGE_BOX_SKIP_KEYS.has(key)) continue
        if (key === 'display' && newValue === 'flex') continue
        if (!hasMaskImage && key === 'bg') continue
        break
    }
    newProps[key] = newValue
  }
  return newProps
}
