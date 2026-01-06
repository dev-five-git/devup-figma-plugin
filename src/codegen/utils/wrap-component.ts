import { wrapReturnStatement } from './padding-left-multiline'

interface WrapComponentOptions {
  exportDefault?: boolean
}

export function wrapComponent(
  name: string,
  code: string,
  options: WrapComponentOptions = {},
) {
  const { exportDefault = false } = options
  const exportKeyword = exportDefault ? 'export default' : 'export'
  return `${exportKeyword} function ${name}() {
  return ${wrapReturnStatement(code, 1)}
}`
}
