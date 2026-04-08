import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { styleNameToTypography } from '../../utils/style-name-to-typography'
import { toCamel } from '../../utils/to-camel'
import { addPx } from '../utils/add-px'
import { getVariableByIdCached } from '../utils/variable-cache'

type BoundVars = Record<string, { id: string } | undefined> | undefined

/**
 * Resolve effectStyleId to a `$token` for the text shadow value.
 *
 * Must match the key written by export-devup.ts via styleNameToTypography,
 * so only breakpoint prefixes are stripped. Scoped prefixes (e.g. "cms/xyz")
 * stay part of the token name.
 */
async function _resolveEffectStyleToken(
  node: SceneNode,
): Promise<string | null> {
  if (!('effectStyleId' in node)) return null
  const styleId = (node as SceneNode & { effectStyleId: string }).effectStyleId
  if (!styleId || typeof styleId !== 'string') return null
  const style = await figma.getStyleByIdAsync(styleId)
  if (style?.name) {
    return `$${styleNameToTypography(style.name).name}`
  }
  return null
}

export async function getTextShadowProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if (node.type !== 'TEXT') return

  const effects = node.effects.filter((effect) => effect.visible !== false)
  if (effects.length === 0) return
  const dropShadows = effects.filter((effect) => effect.type === 'DROP_SHADOW')
  if (dropShadows.length === 0) return

  // Always produce raw values for responsive merge compatibility.
  const parts = await Promise.all(
    dropShadows.map(async (dropShadow) => {
      const bv =
        'boundVariables' in dropShadow
          ? (dropShadow.boundVariables as BoundVars)
          : undefined

      const [ex, ey, er, ec] = await Promise.all([
        _resolveLength(bv, 'offsetX', dropShadow.offset.x, '0'),
        _resolveLength(bv, 'offsetY', dropShadow.offset.y, '0'),
        _resolveLength(bv, 'radius', dropShadow.radius, '0'),
        _resolveColor(bv, dropShadow.color),
      ])

      return `${ex} ${ey} ${er} ${ec}`
    }),
  )

  const result: Record<string, string> = {
    textShadow: parts.join(', '),
  }

  // Store effectStyleId token as metadata for post-merge optimization.
  const effectToken = await _resolveEffectStyleToken(node)
  if (effectToken) {
    result.__textShadowToken = effectToken
  }

  return result
}

async function _resolveLength(
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

async function _resolveColor(bv: BoundVars, color: RGBA): Promise<string> {
  if (bv?.color) {
    const variable = await getVariableByIdCached(bv.color.id)
    if (variable?.name) return `$${toCamel(variable.name)}`
  }
  return optimizeHex(rgbaToHex(color))
}
