export function fmtPct(n: number) {
  // Round to 2 decimal places
  const rounded = Math.round(n * 100) / 100

  // Format with 2 decimal places
  const formatted = rounded.toFixed(2)

  // Remove unnecessary trailing zeros
  // .00 -> remove entirely (156.00 -> 156)
  // .X0 -> remove trailing 0 (156.30 -> 156.3)
  return formatted.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}
