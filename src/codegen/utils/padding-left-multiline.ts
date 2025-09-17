import { space } from '../../utils'

export function paddingLeftMultiline(code: string, dep = 0) {
  if (dep === 0) return code
  return code
    .split('\n')
    .map((line) => space(dep) + line)
    .join('\n')
}
