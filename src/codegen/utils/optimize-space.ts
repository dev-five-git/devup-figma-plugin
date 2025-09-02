import { addPx } from './add-px'

export function optimizeSpace(
  type: 'm' | 'p',
  t: number,
  r: number,
  b: number,
  l: number,
): Record<string, string> {
  if (t === r && r === b && b === l) {
    return { [type]: addPx(t)! }
  }
  if (t === b && r === l) {
    return { [type + 'y']: addPx(t)!, [type + 'x']: addPx(l)! }
  }
  if (t === b) {
    return {
      [type + 'y']: addPx(t)!,
      [type + 'r']: addPx(r)!,
      [type + 'l']: addPx(l)!,
    }
  }
  if (l === r) {
    return {
      [type + 'x']: addPx(l)!,
      [type + 't']: addPx(t)!,
      [type + 'b']: addPx(b)!,
    }
  }
  return {
    [type + 't']: addPx(t)!,
    [type + 'r']: addPx(r)!,
    [type + 'b']: addPx(b)!,
    [type + 'l']: addPx(l)!,
  }
}
