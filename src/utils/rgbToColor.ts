export function rgbToColor(color: { r: number; g: number; b: number }) {
  const r = Math.round(color.r * 255).toString(16)
  const g = Math.round(color.g * 255).toString(16)
  const b = Math.round(color.b * 255).toString(16)
  return `#${r.length === 1 ? '0' + r : r}${g.length === 1 ? '0' + g : g}${b.length === 1 ? '0' + b : b}`
}
