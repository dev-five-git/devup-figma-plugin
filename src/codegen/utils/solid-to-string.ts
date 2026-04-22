import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { toCamel } from '../../utils/to-camel'
import { getVariableByIdCached } from './variable-cache'

const solidPaintStringCache = new WeakMap<SolidPaint, string>()

/**
 * Synchronous fast path for solidToString.
 * Returns the color string immediately for non-variable paints.
 * Returns null when the paint is variable-bound (caller must use async solidToString).
 */
export function solidToStringSync(solid: SolidPaint): string | null {
  if (solid.boundVariables?.color) return null
  const cached = solidPaintStringCache.get(solid)
  if (cached) return cached

  const result =
    solid.opacity === 0
      ? 'transparent'
      : optimizeHex(
          rgbaToHex(
            figma.util.rgba({
              ...solid.color,
              a: solid.opacity ?? 1,
            }),
          ),
        )

  solidPaintStringCache.set(solid, result)
  return result
}

export async function solidToString(solid: SolidPaint) {
  const cached = solidPaintStringCache.get(solid)
  if (cached) return cached

  if (solid.boundVariables?.color) {
    const variable = await getVariableByIdCached(
      solid.boundVariables.color.id as string,
    )
    if (variable?.name) {
      const result = `$${toCamel(variable.name)}`
      solidPaintStringCache.set(solid, result)
      return result
    }
  }
  const result =
    solid.opacity === 0
      ? 'transparent'
      : optimizeHex(
          rgbaToHex(
            figma.util.rgba({
              ...solid.color,
              a: solid.opacity ?? 1,
            }),
          ),
        )

  solidPaintStringCache.set(solid, result)
  return result
}
