import { addPx } from './add-px'
import { resolveBoundVariable } from './resolve-bound-variable'

export function optimizeSpace(
  type: 'm' | 'p',
  t: number,
  r: number,
  b: number,
  l: number,
): Record<string, string | undefined> {
  // Round to 2 decimal places to handle Figma floating-point imprecision
  // (e.g. 1.5 vs 1.5000009536743164). Matches formatNumber's rounding.
  t = Math.round(t * 100) / 100
  r = Math.round(r * 100) / 100
  b = Math.round(b * 100) / 100
  l = Math.round(l * 100) / 100

  if (t === r && r === b && b === l) {
    return { [type]: addPx(t) }
  }
  if (t === b && r === l) {
    return { [`${type}y`]: addPx(t), [`${type}x`]: addPx(l) }
  }
  if (t === b) {
    return {
      [`${type}y`]: addPx(t),
      [`${type}r`]: addPx(r),
      [`${type}l`]: addPx(l),
    }
  }
  if (l === r) {
    return {
      [`${type}x`]: addPx(l),
      [`${type}t`]: addPx(t),
      [`${type}b`]: addPx(b),
    }
  }
  return {
    [`${type}t`]: addPx(t),
    [`${type}r`]: addPx(r),
    [`${type}b`]: addPx(b),
    [`${type}l`]: addPx(l),
  }
}

const FIELD_MAP = {
  p: {
    t: 'paddingTop',
    r: 'paddingRight',
    b: 'paddingBottom',
    l: 'paddingLeft',
  },
  m: {
    t: 'marginTop',
    r: 'marginRight',
    b: 'marginBottom',
    l: 'marginLeft',
  },
} as const

/**
 * Async variant of optimizeSpace that resolves variable-bound padding/margin.
 * Fast path: if no boundVariables exist, delegates to sync optimizeSpace.
 */
export async function optimizeSpaceAsync(
  type: 'm' | 'p',
  t: number,
  r: number,
  b: number,
  l: number,
  boundVariables: Record<string, { id: string } | undefined> | undefined | null,
): Promise<Record<string, string | undefined>> {
  const fields = FIELD_MAP[type]

  // Fast path: no boundVariables, delegate to sync version
  if (
    !boundVariables ||
    (!boundVariables[fields.t] &&
      !boundVariables[fields.r] &&
      !boundVariables[fields.b] &&
      !boundVariables[fields.l])
  ) {
    return optimizeSpace(type, t, r, b, l)
  }

  // Resolve all four values in parallel
  const [vt, vr, vb, vl] = await Promise.all([
    resolveBoundVariable(boundVariables, fields.t),
    resolveBoundVariable(boundVariables, fields.r),
    resolveBoundVariable(boundVariables, fields.b),
    resolveBoundVariable(boundVariables, fields.l),
  ])

  // If no variables actually resolved, fall back to sync
  if (!vt && !vr && !vb && !vl) {
    return optimizeSpace(type, t, r, b, l)
  }

  // Round raw values for non-variable sides
  const top = vt ?? addPx(Math.round(t * 100) / 100)
  const right = vr ?? addPx(Math.round(r * 100) / 100)
  const bottom = vb ?? addPx(Math.round(b * 100) / 100)
  const left = vl ?? addPx(Math.round(l * 100) / 100)

  // Shorthand optimization using string comparison
  if (top === right && right === bottom && bottom === left) {
    return { [type]: top }
  }
  if (top === bottom && right === left) {
    return { [`${type}y`]: top, [`${type}x`]: left }
  }
  if (top === bottom) {
    return {
      [`${type}y`]: top,
      [`${type}r`]: right,
      [`${type}l`]: left,
    }
  }
  if (left === right) {
    return {
      [`${type}x`]: left,
      [`${type}t`]: top,
      [`${type}b`]: bottom,
    }
  }
  return {
    [`${type}t`]: top,
    [`${type}r`]: right,
    [`${type}b`]: bottom,
    [`${type}l`]: left,
  }
}
