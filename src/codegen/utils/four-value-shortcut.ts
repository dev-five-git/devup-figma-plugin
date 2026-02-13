import { addPx } from './add-px'

export function fourValueShortcut(
  _first: number,
  _second: number,
  _third: number,
  _fourth: number,
): string {
  // Round to 2 decimal places to handle Figma floating-point imprecision
  const first = Math.round(_first * 100) / 100
  const second = Math.round(_second * 100) / 100
  const third = Math.round(_third * 100) / 100
  const fourth = Math.round(_fourth * 100) / 100

  if (first === second && second === third && third === fourth)
    return addPx(first, '0')
  if (first === third && second === fourth)
    return `${addPx(first, '0')} ${addPx(second, '0')}`
  if (second === fourth)
    return `${addPx(first, '0')} ${addPx(second, '0')} ${addPx(third, '0')}`
  return `${addPx(first, '0')} ${addPx(second, '0')} ${addPx(third, '0')} ${addPx(fourth, '0')}`
}
