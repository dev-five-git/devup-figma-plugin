import { formatNumber } from './format-number'

export function addPx(value: unknown, fallback: string): string
export function addPx(value: unknown, fallback?: string): string | undefined
export function addPx(
  value: unknown,
  fallback: string | undefined = undefined,
) {
  if (typeof value !== 'number') return fallback

  const str = formatNumber(value)

  if (str === '0') return fallback
  return `${str}px`
}
