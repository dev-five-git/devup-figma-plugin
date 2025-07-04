export function toPascal(str: string): string {
  return str
    .split(/([A-Z][a-z]+|[-_ /])/)
    .flatMap((e) => {
      return /[^A-Z][A-Z]$/.test(e)
        ? [e.slice(0, e.length - 1), e.slice(e.length - 1)]
        : e
    })
    .filter((e) => {
      if (!e || e === '-' || e === '_' || e === '/' || e === ' ') return false
      return true
    })
    .map((word) => {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join('')
}
