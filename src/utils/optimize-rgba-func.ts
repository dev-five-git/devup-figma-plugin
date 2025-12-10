import { optimizeHex } from './optimize-hex'

const rgbaRegex =
  /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(,\s*([\d.]+))?\s*\)?/g
export function optimizeRgbaFunc(value: string) {
  const match = value.replace(rgbaRegex, (_, r, g, b, __, a = 1) => {
    return optimizeHex(
      `#${parseInt(r, 10).toString(16).padStart(2, '0')}${parseInt(g, 10).toString(16).padStart(2, '0')}${parseInt(b, 10).toString(16).padStart(2, '0')}${Math.round(
        a * 255,
      )
        .toString(16)
        .padStart(2, '0')}`.toUpperCase(),
    )
  })
  return match
}
