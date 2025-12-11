export function propsToString(props: Record<string, unknown>) {
  const sorted = Object.entries(props).sort((a, b) => {
    const isAUpper = /^[A-Z]/.test(a[0])
    const isBUpper = /^[A-Z]/.test(b[0])
    if (isAUpper && !isBUpper) return -1
    if (!isAUpper && isBUpper) return 1
    return a[0].localeCompare(b[0])
  })

  const parts = sorted.map(([key, value]) => {
    if (typeof value === 'boolean') return `${key}${value ? '' : `={${value}}`}`
    if (typeof value === 'object')
      return `${key}={${JSON.stringify(value, null, 2)}}`
    return `${key}="${value}"`
  })

  const separator =
    Object.keys(props).length >= 5 ||
    Object.values(props).some((value) => typeof value === 'object')
      ? '\n'
      : ' '
  return parts.join(separator)
}
