import { sanitizePropertyName } from '../props/selector'

/**
 * Reserved variant keys that should not be passed as props.
 * These are used internally for responsive and effect handling.
 */
const RESERVED_VARIANT_KEYS = ['effect', 'viewport']

/**
 * Check if a key is a reserved variant key (case-insensitive).
 */
function isReservedVariantKey(key: string): boolean {
  const lowerKey = key.toLowerCase()
  return RESERVED_VARIANT_KEYS.some(
    (reserved) => lowerKey === reserved || lowerKey.startsWith(`${reserved}#`),
  )
}

/**
 * Extract variant props from an Instance node's componentProperties.
 * Returns an object with sanitized property names as keys and variant values as string values.
 * Filters out reserved variant keys (effect, viewport) which are used internally.
 *
 * @example
 * // Instance with componentProperties: { "status#123": { type: "VARIANT", value: "scroll" } }
 * // Returns: { status: "scroll" }
 */
export function extractInstanceVariantProps(
  node: InstanceNode,
): Record<string, string> {
  const variantProps: Record<string, string> = {}

  if (!node.componentProperties) {
    return variantProps
  }

  for (const [key, prop] of Object.entries(node.componentProperties)) {
    if (prop.type === 'VARIANT' && !isReservedVariantKey(key)) {
      const sanitizedKey = sanitizePropertyName(key)
      variantProps[sanitizedKey] = String(prop.value)
    }
  }

  return variantProps
}
