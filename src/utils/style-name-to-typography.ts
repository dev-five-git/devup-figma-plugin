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
    const [type, _name] = name.split('/')
    const typeNumber = parseInt(type, 10)
    if (!Number.isNaN(typeNumber))
      return { level: typeNumber, name: toCamel(_name) }
  }

  return { level: 0, name: toCamel(name) }
}
