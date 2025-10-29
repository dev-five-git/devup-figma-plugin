export function propsToString(props: Record<string, unknown>) {
  return Object.entries(props)
    .sort((a, b) => {
      const isAUpper = /^[A-Z]/.test(a[0])
      const isBUpper = /^[A-Z]/.test(b[0])
      if (isAUpper && !isBUpper) return -1
      if (!isAUpper && isBUpper) return 1
      return a[0].localeCompare(b[0])
    })
    .map(
      ([key, value]) =>
        `${key}${typeof value === 'boolean' ? (value ? '' : `={${value}}`) : typeof value === 'object' ? `={${JSON.stringify(value, null, 2)}}` : `="${value}"`}`,
    )
    .join(
      Object.keys(props).length >= 5 ||
        Object.values(props).some((value) => typeof value === 'object')
        ? '\n'
        : ' ',
    )
}
