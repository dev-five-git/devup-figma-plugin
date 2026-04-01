import { toCamel } from '../../utils/to-camel'
import { getVariableByIdCached } from './variable-cache'

/**
 * Resolve a bound variable for a given field on any object with boundVariables.
 * Returns `$variableName` (camelCase) if the field is variable-bound, null otherwise.
 *
 * Works for both node-level bindings (padding, spacing, sizing, radius)
 * and effect-level bindings (shadow offset, radius, spread, color).
 *
 * @example
 *   // Node-level: node.boundVariables?.paddingLeft
 *   await resolveBoundVariable(node.boundVariables, 'paddingLeft')
 *   // → "$containerX" or null
 *
 *   // Effect-level: effect.boundVariables?.radius
 *   await resolveBoundVariable(effect.boundVariables, 'radius')
 *   // → "$shadowBlur" or null
 */
export async function resolveBoundVariable(
  boundVariables: Record<string, { id: string } | undefined> | undefined | null,
  field: string,
): Promise<string | null> {
  const binding = boundVariables?.[field]
  if (!binding) return null
  const variable = await getVariableByIdCached(binding.id)
  if (variable?.name) return `$${toCamel(variable.name)}`
  return null
}

/**
 * Synchronous fast path for resolveBoundVariable.
 * Returns true if the field has a bound variable (caller must use async
 * resolveBoundVariable). Returns false when no variable is bound.
 */
export function hasBoundVariable(
  boundVariables: Record<string, { id: string } | undefined> | undefined | null,
  field: string,
): boolean {
  return !!boundVariables?.[field]
}
