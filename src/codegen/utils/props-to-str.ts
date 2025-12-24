import { isVariantPropValue } from '../responsive'

/**
 * Convert a value to its JSX string representation.
 * Handles primitives, arrays, and objects.
 */
function valueToJsxString(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => valueToJsxString(item))
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Format a VariantPropValue as JSX: { scroll: [...], default: [...] }[status]
 */
function formatVariantPropValue(variantProp: {
  variantKey: string
  values: Record<string, unknown>
}): string {
  const entries = Object.entries(variantProp.values)
  const parts = entries.map(([variant, value]) => {
    return `${variant}: ${valueToJsxString(value)}`
  })
  return `{ ${parts.join(', ')} }[${variantProp.variantKey}]`
}

export function propsToString(props: Record<string, unknown>) {
  const sorted = Object.entries(props).sort((a, b) => {
    const isAUpper = /^[A-Z]/.test(a[0])
    const isBUpper = /^[A-Z]/.test(b[0])
    if (isAUpper && !isBUpper) return -1
    if (!isAUpper && isBUpper) return 1
    return a[0].localeCompare(b[0])
  })

  const parts = sorted.map(([key, value]) => {
    if (typeof value === 'boolean') return `${key}${value ? '' : `={${value}}`}`
    // Handle VariantPropValue
    if (isVariantPropValue(value)) {
      return `${key}={${formatVariantPropValue(value)}}`
    }
    if (typeof value === 'object')
      return `${key}={${JSON.stringify(value, null, 2)}}`
    // Special handling for animationName with keyframes function
    if (
      key === 'animationName' &&
      typeof value === 'string' &&
      value.startsWith('keyframes(')
    ) {
      // Extract JSON from keyframes(...) and format it nicely
      const match = value.match(/^keyframes\((.+)\)$/)
      if (match) {
        try {
          const jsonData = JSON.parse(match[1])
          const formatted = JSON.stringify(jsonData, null, 2)
          return `${key}={keyframes(${formatted})}`
        } catch {
          // If parsing fails, return as-is
          return `${key}={${value}}`
        }
      }
      return `${key}={${value}}`
    }
    return `${key}="${value}"`
  })

  const separator =
    Object.keys(props).length >= 5 ||
    Object.values(props).some(
      (value) => typeof value === 'object' && !isVariantPropValue(value),
    )
      ? '\n'
      : ' '
  return parts.join(separator)
}
