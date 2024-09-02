export function colorToRgb(color: string) {
  console.log(color)
  if (color.startsWith('#')) color = color.slice(1)
  if (color.length !== 6 && color.length !== 3)
    throw new Error(`Invalid color ${color}`)
  if (color.length === 3)
    color = color
      .split('')
      .map((c) => c + c)
      .join('')
  const r = parseInt(color.slice(0, 2), 16) / 255
  const g = parseInt(color.slice(2, 4), 16) / 255
  const b = parseInt(color.slice(4, 6), 16) / 255
  return { r, g, b }
}
