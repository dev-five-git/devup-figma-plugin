import { toCamel } from './to-camel'

export function styleNameToTypography(name: string): {
  type: 'mobile' | 'tablet' | 'desktop'
  name: string
} {
  const lower = name.toLowerCase()
  if (lower.startsWith('desktop/'))
    return { type: 'desktop', name: toCamel(name.slice(8)) }
  if (lower.startsWith('tablet/'))
    return { type: 'tablet', name: toCamel(name.slice(7)) }
  if (lower.startsWith('mobile/'))
    return { type: 'mobile', name: toCamel(name.slice(7)) }
  return { type: 'mobile', name: toCamel(name) }
}
