import { addPx } from './add-px'

export function fourValueShortcut(
  first: number,
  second: number,
  third: number,
  fourth: number,
): string {
  if (first === second && second === third && third === fourth)
    return addPx(first)!
  if (first === third && second === fourth)
    return `${addPx(first)} ${addPx(second)}`
  if (first === third && second === fourth)
    return `${addPx(first)} ${addPx(second)}`
  if (second === fourth)
    return `${addPx(first)} ${addPx(second)} ${addPx(third)}`
  return `${addPx(first)} ${addPx(second)} ${addPx(third)} ${addPx(fourth)}`
}
