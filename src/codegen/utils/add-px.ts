export function addPx(value: unknown, fallback: string): string
export function addPx(value: unknown, fallback?: string): string | undefined
export function addPx(
  value: unknown,
  fallback: string | undefined = undefined,
) {
  if (typeof value !== 'number') return fallback

  // Round to 2 decimal places (same as fmtPct)
  const rounded = Math.round(value * 100) / 100
  const fixed = rounded.toFixed(2)

  // Remove unnecessary trailing zeros
  const str = fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')

  if (str === '0') return fallback
  return `${str}px`
}
