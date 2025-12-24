/**
 * Round to 2 decimal places and remove unnecessary trailing zeros
 * Examples:
 *   156.00 -> "156"
 *   156.30 -> "156.3"
 *   156.35 -> "156.35"
 */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100
  const formatted = rounded.toFixed(2)
  return formatted.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}
