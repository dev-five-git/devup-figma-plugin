function normalizeOption(value: string): string {
  return value.trim().toLowerCase()
}

export function isBooleanVariantOptions(options: readonly string[]): boolean {
  if (options.length !== 2) return false
  const normalized = new Set(options.map(normalizeOption))
  return (
    normalized.size === 2 && normalized.has('true') && normalized.has('false')
  )
}

export function getVariantType(options: readonly string[]): string {
  if (isBooleanVariantOptions(options)) return 'boolean'
  return options.map((option) => `'${option}'`).join(' | ')
}

export function coerceBooleanVariantValue(value: string): boolean | string {
  const normalized = normalizeOption(value)
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return value
}

export function getBooleanVariantAccessor(variantKey: string): string {
  return `${variantKey} ?? false`
}
