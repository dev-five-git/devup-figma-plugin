import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { toCamel } from '../../utils/to-camel'
import { getVariableByIdCached } from './variable-cache'

/**
 * Synchronous fast path for solidToString.
 * Returns the color string immediately for non-variable paints.
 * Returns null when the paint is variable-bound (caller must use async solidToString).
 */
export function solidToStringSync(solid: SolidPaint): string | null {
  if (solid.boundVariables?.color) return null
  if (solid.opacity === 0) return 'transparent'
  return optimizeHex(
    rgbaToHex(
      figma.util.rgba({
        ...solid.color,
        a: solid.opacity ?? 1,
      }),
    ),
  )
}

export async function solidToString(solid: SolidPaint) {
  if (solid.boundVariables?.color) {
    const variable = await getVariableByIdCached(
      solid.boundVariables.color.id as string,
    )
    if (variable?.name) return `$${toCamel(variable.name)}`
  }
  if (solid.opacity === 0) return 'transparent'
  return optimizeHex(
    rgbaToHex(
      figma.util.rgba({
        ...solid.color,
        a: solid.opacity ?? 1,
      }),
    ),
  )
}
