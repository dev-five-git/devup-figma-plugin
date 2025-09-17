export function replaceAllVarFunctions(
  str: string,
  replacer: (v: string) => string,
): string {
  let result = ''
  let i = 0
  while (i < str.length) {
    const varStart = str.indexOf('var(', i)
    if (varStart === -1) {
      result += str.slice(i)
      break
    }
    result += str.slice(i, varStart)
    let open = 1
    let end = varStart + 4
    for (; end < str.length; end++) {
      if (str[end] === '(') open++
      if (str[end] === ')') open--
      if (open === 0) break
    }
    const varContent = str.slice(varStart, end + 1)
    result += replacer(varContent)
    i = end + 1
  }
  return result
}
