import { space } from '../../utils'

/**
 * 코드 블록의 각 줄에 들여쓰기 추가
 */
export function paddingLeftMultiline(code: string, depth = 0) {
  if (depth === 0) return code
  return code
    .split('\n')
    .map((line) => space(depth) + line)
    .join('\n')
}

/**
 * return 문으로 JSX 코드를 래핑
 * - 한 줄: `<Component />`
 * - 여러 줄: `(\n    <Component>\n    </Component>\n  )`
 */
export function wrapReturnStatement(code: string, baseDepth = 1): string {
  const hasNewLine = code.includes('\n')
  if (!hasNewLine) {
    return code.trim().replace(/\s+/g, ' ')
  }
  // 멀티라인: ( ... )
  const indentedCode = paddingLeftMultiline(code, baseDepth + 1)
  return `(\n${indentedCode}\n${space(baseDepth)})`
}
