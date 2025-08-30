export function propsToString(props: Record<string, unknown>) {
  return Object.entries(props)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([key, value]) =>
        `${key}${typeof value === 'boolean' ? (value ? '' : `={${value}}`) : `="${value}"`}`,
    )
    .join(
      Object.keys(props).length >= 5 ||
        Object.values(props).some((value) => typeof value === 'object')
        ? '\n'
        : ' ',
    )
}
