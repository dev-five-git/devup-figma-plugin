import { toCamel } from './to-camel'

export function styleNameToTypography(name: string): {
  level: number
  name: string
} {
  const lower = name.toLowerCase()
  if (lower.startsWith('desktop/'))
    return { level: 4, name: toCamel(name.slice(8)) }
  if (lower.startsWith('tablet/'))
    return { level: 2, name: toCamel(name.slice(7)) }
  if (lower.startsWith('mobile/'))
    return { level: 0, name: toCamel(name.slice(7)) }
  if (lower.includes('/')) {
    const [type, name] = lower.split('/')
    const typeNumber = parseInt(type)
    if (!isNaN(typeNumber)) return { level: typeNumber, name: toCamel(name) }
  }

  return { level: 0, name: toCamel(name) }
}
