import { addPx } from './add-px'

export function fourValueShortcut(
  first: number,
  second: number,
  third: number,
  fourth: number,
): string {
  if (first === second && second === third && third === fourth)
    return addPx(first, '0')
  if (first === third && second === fourth)
    return `${addPx(first, '0')} ${addPx(second, '0')}`
  if (second === fourth)
    return `${addPx(first, '0')} ${addPx(second, '0')} ${addPx(third, '0')}`
  return `${addPx(first, '0')} ${addPx(second, '0')} ${addPx(third, '0')} ${addPx(fourth, '0')}`
}
