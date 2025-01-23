export function toCamel(str: string): string {
  return str.replace(/[_-]([a-zA-Z])/g, (_, letter) => letter.toUpperCase())
}
