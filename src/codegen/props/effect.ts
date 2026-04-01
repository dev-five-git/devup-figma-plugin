import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { toCamel } from '../../utils/to-camel'
import { addPx } from '../utils/add-px'
import { getVariableByIdCached } from '../utils/variable-cache'

type BoundVars = Record<string, { id: string } | undefined> | undefined

/**
 * Resolve effectStyleId to a `$token` for the entire shadow value.
 * The effect style name IS the shadow token (not a color token).
 */
async function _resolveEffectStyleToken(
  node: SceneNode,
): Promise<string | null> {
  if (!('effectStyleId' in node)) return null
  const styleId = (node as SceneNode & { effectStyleId: string }).effectStyleId
  if (!styleId || typeof styleId !== 'string') return null
  const style = await figma.getStyleByIdAsync(styleId)
  if (style?.name) {
    // Strip responsive level prefix (e.g. "3/testShadow" → "testShadow")
    const parts = style.name.split('/')
    return `$${toCamel(parts[parts.length - 1])}`
  }
  return null
}

export async function getEffectProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if (!('effects' in node) || node.effects.length === 0) return

  // TEXT nodes use textShadow for DROP_SHADOW (handled by text-shadow.ts)
  const effects =
    node.type === 'TEXT'
      ? node.effects.filter((e) => e.type !== 'DROP_SHADOW')
      : node.effects
  if (effects.length === 0) return

  // Always produce raw values with effect.boundVariables support.
  // This preserves per-breakpoint differences so the responsive merge
  // can detect them and produce responsive arrays.
  const result: Record<string, string> = {}
  for (const effect of effects) {
    const props = await _getEffectPropsFromEffect(effect)
    for (const [key, value] of Object.entries(props)) {
      if (value) {
        result[key] = result[key] ? `${result[key]}, ${value}` : value
      }
    }
  }
  if (Object.keys(result).length === 0) return

  // Store effectStyleId token as metadata — the responsive merge uses this
  // to replace the raw shadow with the token when it collapses to a single value.
  if (result.boxShadow) {
    const effectToken = await _resolveEffectStyleToken(node)
    if (effectToken) {
      result.__boxShadowToken = effectToken
    }
  }

  return result
}

async function _resolveEffectColor(
  bv: BoundVars,
  color: RGBA,
): Promise<string> {
  if (bv?.color) {
    const variable = await getVariableByIdCached(bv.color.id)
    if (variable?.name) return `$${toCamel(variable.name)}`
  }
  return optimizeHex(rgbaToHex(color))
}

async function _resolveEffectLength(
  bv: BoundVars,
  field: string,
  value: number,
  fallback: string,
): Promise<string> {
  if (bv?.[field]) {
    const variable = await getVariableByIdCached(bv[field].id)
    if (variable?.name) return `$${toCamel(variable.name)}`
  }
  return addPx(value, fallback)
}

async function _getEffectPropsFromEffect(
  effect: Effect,
): Promise<Record<string, string>> {
  const bv =
    'boundVariables' in effect
      ? (effect.boundVariables as BoundVars)
      : undefined

  switch (effect.type) {
    case 'DROP_SHADOW': {
      const { offset, radius, spread, color } = effect
      const { x, y } = offset

      const [ex, ey, er, es, ec] = await Promise.all([
        _resolveEffectLength(bv, 'offsetX', x, '0'),
        _resolveEffectLength(bv, 'offsetY', y, '0'),
        _resolveEffectLength(bv, 'radius', radius, '0'),
        _resolveEffectLength(bv, 'spread', spread ?? 0, '0'),
        _resolveEffectColor(bv, color),
      ])

      return {
        boxShadow: `${ex} ${ey} ${er} ${es} ${ec}`,
      }
    }
    case 'INNER_SHADOW': {
      const { offset, radius, spread, color } = effect
      const { x, y } = offset

      const [ex, ey, er, es, ec] = await Promise.all([
        _resolveEffectLength(bv, 'offsetX', x, '0'),
        _resolveEffectLength(bv, 'offsetY', y, '0'),
        _resolveEffectLength(bv, 'radius', radius, '0'),
        _resolveEffectLength(bv, 'spread', spread ?? 0, '0'),
        _resolveEffectColor(bv, color),
      ])

      return {
        boxShadow: `inset ${ex} ${ey} ${er} ${es} ${ec}`,
      }
    }
    case 'LAYER_BLUR':
      return {
        filter: `blur(${effect.radius}px)`,
      }

    case 'BACKGROUND_BLUR':
      return {
        backdropFilter: `blur(${effect.radius}px)`,
      }

    case 'NOISE':
      return {
        filter: 'contrast(100%) brightness(100%)',
      }

    case 'TEXTURE':
      return {
        filter: 'contrast(100%) brightness(100%)',
      }
    case 'GLASS':
      return {
        backdropFilter: `blur(${effect.radius}px)`,
      }
  }
}
