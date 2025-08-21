const hexRegex =
  /#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/g

export function optimizeHex(value: string): string {
  return value.replace(
    hexRegex,
    (_, r: string, g: string, b: string, a: string) => {
      if (a?.toUpperCase() === 'FF') return optimizeHex(`#${r}${g}${b}`)
      const filterdValue = [r, g, b, a].filter(Boolean)
      if (filterdValue.every((v) => v[0] === v[1]))
        return `#${filterdValue[0][0]}${filterdValue[1][0]}${filterdValue[2][0]}${filterdValue?.[3]?.[0] || ''}`
      return `#${r}${g}${b}${a || ''}`
    },
  )
}
