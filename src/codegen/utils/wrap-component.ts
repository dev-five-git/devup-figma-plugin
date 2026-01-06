import { paddingLeftMultiline } from './padding-left-multiline'

interface WrapComponentOptions {
  exportDefault?: boolean
}

export function wrapComponent(
  name: string,
  code: string,
  options: WrapComponentOptions = {},
) {
  const { exportDefault = false } = options
  const hasNewLine = code.includes('\n')
  const exportKeyword = exportDefault ? 'export default' : 'export'
  return `${exportKeyword} function ${name}() {
  return ${hasNewLine ? `(\n${paddingLeftMultiline(code, 2)}\n  )` : code}
}`
}
