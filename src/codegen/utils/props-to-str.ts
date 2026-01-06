import { isVariantPropValue } from '../responsive'

/**
 * Check if a string is a valid JavaScript identifier.
 * If not, it needs to be quoted when used as an object key.
 */
function needsQuotes(key: string): boolean {
  // Valid identifier: starts with letter/$/_, contains only letters/digits/$/_
  return !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
}

/**
 * Format an object key, adding quotes if necessary.
 */
function formatObjectKey(key: string): string {
  return needsQuotes(key) ? `'${key}'` : key
}

/**
 * Convert a value to its JSX string representation.
 * Handles primitives, arrays, objects, and VariantPropValue.
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
  // Handle VariantPropValue inside objects
  if (isVariantPropValue(value)) {
    return formatVariantPropValue(value)
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Check if a VariantPropValue needs multiline formatting.
 * Returns true if:
 * - There are 2 or more variant entries, OR
 * - Any value is complex (array, object, or nested VariantPropValue)
 */
function needsMultilineFormat(values: Record<string, unknown>): boolean {
  const entries = Object.entries(values)
  // Always use multiline if there are 2+ entries
  if (entries.length >= 2) return true
  // Also use multiline for complex values
  return Object.values(values).some(
    (value) =>
      Array.isArray(value) ||
      (typeof value === 'object' && value !== null) ||
      isVariantPropValue(value),
  )
}

/**
 * Format a VariantPropValue as JSX: { scroll: [...], default: [...] }[status]
 * Uses multiline format when values are complex (arrays, objects, nested variants).
 * When asConst is true, wraps with parentheses and adds 'as const' for literal type inference.
 */
function formatVariantPropValue(
  variantProp: {
    variantKey: string
    values: Record<string, unknown>
  },
  indent: number = 0,
  asConst: boolean = false,
): string {
  const entries = Object.entries(variantProp.values)
  const accessor = `[${variantProp.variantKey}]`

  // Helper to wrap with as const if needed
  const wrapAsConst = (objStr: string) => {
    if (asConst) {
      return `(${objStr} as const)${accessor}`
    }
    return `${objStr}${accessor}`
  }

  // Use multiline format for complex values
  if (needsMultilineFormat(variantProp.values)) {
    const spaces = '  '.repeat(indent + 1)
    const closingSpaces = '  '.repeat(indent)
    const parts = entries.map(([variant, value]) => {
      const formattedValue = formatValueWithIndent(value, indent + 1)
      return `${spaces}${formatObjectKey(variant)}: ${formattedValue}`
    })
    const obj = `{\n${parts.join(',\n')}\n${closingSpaces}}`
    return wrapAsConst(obj)
  }

  // For single entry with primitive value, use conditional expression (unless asConst)
  // e.g., property1 === 'Frame 646' && 'solid 1px $border'
  if (entries.length === 1 && !asConst) {
    const [variant, value] = entries[0]
    return `${variantProp.variantKey} === '${variant}' && ${valueToJsxString(value)}`
  }

  // Simple inline format for primitive values (2+ entries or asConst with single entry)
  const parts = entries.map(([variant, value]) => {
    return `${formatObjectKey(variant)}: ${valueToJsxString(value)}`
  })
  const obj = `{ ${parts.join(', ')} }`
  return wrapAsConst(obj)
}

/**
 * Format a value with proper indentation for multiline output.
 */
function formatValueWithIndent(value: unknown, indent: number): string {
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
  if (isVariantPropValue(value)) {
    return formatVariantPropValue(value, indent)
  }
  if (typeof value === 'object') {
    return objectToJsxString(value as Record<string, unknown>, indent)
  }
  return String(value)
}

/**
 * Convert an object to JSX string, handling nested VariantPropValue.
 * Uses JSON.stringify-like formatting but replaces VariantPropValue with proper syntax.
 */
function objectToJsxString(
  obj: Record<string, unknown>,
  indent: number = 0,
): string {
  const entries = Object.entries(obj)
  const spaces = '  '.repeat(indent + 1)
  const closingSpaces = '  '.repeat(indent)

  const parts = entries.map(([key, value]) => {
    const formattedValue = formatObjectValue(value, indent + 1)
    return `${spaces}"${key}": ${formattedValue}`
  })

  return `{\n${parts.join(',\n')}\n${closingSpaces}}`
}

/**
 * Format a value inside an object, handling nested objects and VariantPropValue.
 */
function formatObjectValue(value: unknown, indent: number): string {
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
  if (isVariantPropValue(value)) {
    return formatVariantPropValue(value, indent)
  }
  if (typeof value === 'object') {
    return objectToJsxString(value as Record<string, unknown>, indent)
  }
  return String(value)
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
      const asConst = key === 'typography'
      return `${key}={${formatVariantPropValue(value, 0, asConst)}}`
    }
    // Handle pseudo-selector props (e.g., _hover, _active) which may contain VariantPropValue
    if (typeof value === 'object' && value !== null && key.startsWith('_')) {
      return `${key}={${objectToJsxString(value as Record<string, unknown>)}}`
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
      (value) =>
        (typeof value === 'object' && value !== null) ||
        isVariantPropValue(value),
    )
      ? '\n'
      : ' '
  return parts.join(separator)
}
