import { describe, expect, test } from 'bun:test'
import { textStyleToTypography } from '../text-style-to-typography'

function makeStyle(styleName: string): TextStyle {
  return {
    id: 'style',
    name: 'style',
    description: '',
    remote: false,
    documentationLinks: [],
    key: '',
    fontName: { family: 'Pretendard', style: styleName },
    fontSize: 16,
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    paragraphIndent: 0,
    paragraphSpacing: 0,
    textAlignHorizontal: 'LEFT',
    textAlignVertical: 'TOP',
    lineHeight: { unit: 'AUTO' },
    letterSpacing: { unit: 'PIXELS', value: 0 },
  } as unknown as TextStyle
}

describe('textStyleToTypography', () => {
  test.each([
    ['Thin', 100],
    ['Extra Light', 200],
    ['Light', 300],
    ['Regular', 400],
    ['normal', 400],
    ['Medium', 500],
    ['Semibold', 600],
    ['SemiBold', 600],
    ['Bold', 700],
    ['Extra Bold', 800],
    ['Black', 900],
    ['Heavy', 900],
    ['750', 750],
    ['UnknownWeight', 400],
  ])('maps %s to fontWeight %d', (styleName, expected) => {
    const result = textStyleToTypography(makeStyle(styleName))
    expect(result.fontWeight).toBe(expected)
  })
})
