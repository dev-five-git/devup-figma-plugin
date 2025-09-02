export function addPx(value: unknown) {
  if (typeof value !== 'number') return
  const fixed = value.toFixed(3)
  const str = fixed.endsWith('.000')
    ? String(Math.round(value))
    : fixed.replace(/\.?0+$/, '')
  if (str === '0') return undefined
  return `${str}px`
}
