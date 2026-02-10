/**
 * Round to 2 decimal places and remove unnecessary trailing zeros
 * Examples:
 *   156.00 -> "156"
 *   156.30 -> "156.3"
 *   156.35 -> "156.35"
 */
export function formatNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100
  // Integer fast path: skip toFixed entirely
  if (rounded === Math.trunc(rounded)) return String(rounded)
  const formatted = rounded.toFixed(2)
  // Non-integer: only check for single trailing '0' (e.g. "1.30" → "1.3")
  // The '.00' case is impossible here since integers are handled above
  if (formatted.charCodeAt(formatted.length - 1) === 48) {
    return formatted.slice(0, -1)
  }
  return formatted
}
