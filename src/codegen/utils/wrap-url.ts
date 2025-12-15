/**
 * Build a CSS url() value. If the path contains whitespace or characters
 * that commonly require quoting, wrap it in single quotes and escape any
 * existing single quotes.
 */
export function buildCssUrl(path: string): string {
  const normalized = path.trim()
  const needsQuotes = /[\s'"()]/.test(normalized)
  const escaped = normalized.replace(/'/g, "\\'")
  return `url(${needsQuotes ? `'${escaped}'` : escaped})`
}
