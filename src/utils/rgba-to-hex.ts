export function rgbaToHex(rgba: RGBA) {
  const a =
    rgba.a === 1
      ? ''
      : Math.round(rgba.a * 255)
          .toString(16)
          .toUpperCase()
  const r = Math.round(rgba.r * 255)
    .toString(16)
    .toUpperCase()
  const g = Math.round(rgba.g * 255)
    .toString(16)
    .toUpperCase()
  const b = Math.round(rgba.b * 255)
    .toString(16)
    .toUpperCase()
  return `#${r.length === 1 ? '0' + r : r}${g.length === 1 ? '0' + g : g}${b.length === 1 ? '0' + b : b}${
    a.length === 0 ? '' : a.length === 1 ? '0' + a : a
  }`
}
