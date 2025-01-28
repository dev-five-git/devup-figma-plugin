export function toCamel(str: string): string {
  return str.replace(
    /[\s-_]([a-zA-Z])|^([A-Z])/g,
    (o, letter) => letter?.toUpperCase() ?? o.toLowerCase(),
  )
}
