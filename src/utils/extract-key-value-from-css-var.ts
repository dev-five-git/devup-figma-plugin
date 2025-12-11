export function extractKeyValueFromCssVar(
  cssVar: string,
): [key: string, value: string] | undefined {
  const [key, value] = cssVar.split(',')
  const resValue = value?.split(')')[0].trim()
  const resKey = key?.split('(--')[1].trim()
  if (resKey && resValue) return [`$${resKey}`, resValue]
}
