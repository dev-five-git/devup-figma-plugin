export function rgbaToHex(rgba: RGBA) {
  const a = Math.round(rgba.a * 255).toString(16)
  const r = Math.round(rgba.r * 255).toString(16)
  const g = Math.round(rgba.g * 255).toString(16)
  const b = Math.round(rgba.b * 255).toString(16)
  return `#${r.padStart(2, '0')}${g.padStart(2, '0')}${b.padStart(2, '0')}${a.padStart(2, '0')}`.toUpperCase()
}
