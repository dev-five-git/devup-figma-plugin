export function addPx(value: unknown, fallback: string): string
export function addPx(value: unknown, fallback?: string): string | undefined
export function addPx(
  value: unknown,
  fallback: string | undefined = undefined,
) {
  if (typeof value !== 'number') return
  const fixed = value.toFixed(3)
  const str = fixed.endsWith('.000')
    ? String(Math.round(value))
    : fixed.replace(/\.?0+$/, '')
  if (str === '0') return fallback
  return `${str}px`
}
