export function toCamel(str: string): string {
  return str
    .split(/([A-Z][a-z]+|[-_ /])/)
    .filter((e) => {
      if (!e || e === '-' || e === '_' || e === '/' || e === ' ') return false
      return true
    })
    .map((word, index) => {
      if (index === 0) return word.toLowerCase()
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join('')
}
