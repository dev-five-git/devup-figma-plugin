export function fmtPct(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '')
}
