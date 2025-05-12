export function toCamel(str: string): string {
  if (/[-_ /]/g.test(str)) {
    return str
      .split(/[-_ /]/)
      .map((word, index) => {
        if (index === 0) return word.toLowerCase()
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join('')
  }
  return str
    .split(/([A-Z][a-z]+)/)
    .map((word, index) => {
      if (index === 0) return word.toLowerCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join('')
}
