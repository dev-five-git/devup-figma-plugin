const rgbaRegex =
  /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(,\s*([\d.]+))?\s*\)?/g
export function optimizeRgbaFunc(value: string) {
  const match = value.replace(rgbaRegex, (_, r, g, b, __, a) => {
    return `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}${Math.round(
      a * 255,
    )
      .toString(16)
      .padStart(2, '0')}`.toUpperCase()
  })
  return match
}
