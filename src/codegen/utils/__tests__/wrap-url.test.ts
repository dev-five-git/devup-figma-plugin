import { describe, expect, test } from 'bun:test'
import { buildCssUrl } from '../wrap-url'

describe('buildCssUrl', () => {
  test('keeps simple paths unquoted', () => {
    expect(buildCssUrl('/icons/logo.svg')).toBe('url(/icons/logo.svg)')
  })

  test('wraps paths with spaces', () => {
    expect(buildCssUrl('/icons/logo icon.svg')).toBe(
      "url('/icons/logo icon.svg')",
    )
  })

  test('escapes single quotes inside path', () => {
    expect(buildCssUrl("/icons/John's icon.svg")).toBe(
      "url('/icons/John\\'s icon.svg')",
    )
  })
})
