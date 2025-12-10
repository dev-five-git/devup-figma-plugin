import { addPx } from './add-px'

export function optimizeSpace(
  type: 'm' | 'p',
  t: number,
  r: number,
  b: number,
  l: number,
): Record<string, string> {
  if (t === r && r === b && b === l) {
    return { [type]: addPx(t, '0') }
  }
  if (t === b && r === l) {
    return { [`${type}y`]: addPx(t, '0'), [`${type}x`]: addPx(l, '0') }
  }
  if (t === b) {
    return {
      [`${type}y`]: addPx(t, '0'),
      [`${type}r`]: addPx(r, '0'),
      [`${type}l`]: addPx(l, '0'),
    }
  }
  if (l === r) {
    return {
      [`${type}x`]: addPx(l, '0'),
      [`${type}t`]: addPx(t, '0'),
      [`${type}b`]: addPx(b, '0'),
    }
  }
  return {
    [`${type}t`]: addPx(t, '0'),
    [`${type}r`]: addPx(r, '0'),
    [`${type}b`]: addPx(b, '0'),
    [`${type}l`]: addPx(l, '0'),
  }
}
