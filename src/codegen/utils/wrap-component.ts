import { paddingLeftMultiline } from './padding-left-multiline'

export function wrapComponent(name: string, code: string) {
  const hasNewLine = code.includes('\n')
  return `export function ${name}() {
  return ${hasNewLine ? `(\n${paddingLeftMultiline(code, 2)}\n  )` : code}
}`
}
