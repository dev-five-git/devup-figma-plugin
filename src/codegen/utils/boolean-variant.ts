function normalizeOption(value: string): string {
  return value.trim().toLowerCase()
}

const BOOLEAN_VALUE_ALIASES = {
  true: new Set(['true', 'on', 'yes', 'enabled', 'enable', 'checked']),
  false: new Set(['false', 'off', 'no', 'disabled', 'disable', 'unchecked']),
} as const

function getBooleanAlias(value: string): 'true' | 'false' | null {
  const normalized = normalizeOption(value)
  if (BOOLEAN_VALUE_ALIASES.true.has(normalized)) return 'true'
  if (BOOLEAN_VALUE_ALIASES.false.has(normalized)) return 'false'
  return null
}

export function isBooleanVariantOptions(options: readonly string[]): boolean {
  if (options.length !== 2) return false
  const normalized = new Set(options.map((option) => getBooleanAlias(option)))
  return (
    normalized.size === 2 && normalized.has('true') && normalized.has('false')
  )
}

export function getVariantType(options: readonly string[]): string {
  if (isBooleanVariantOptions(options)) return 'boolean'
  return options.map((option) => `'${option}'`).join(' | ')
}

export function coerceBooleanVariantValue(value: string): boolean | string {
  const normalized = getBooleanAlias(value)
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return value
}

export function normalizeBooleanVariantKey(value: string): string {
  return getBooleanAlias(value) ?? value
}

export function getBooleanVariantAccessor(variantKey: string): string {
  return `${variantKey} ?? false`
}
