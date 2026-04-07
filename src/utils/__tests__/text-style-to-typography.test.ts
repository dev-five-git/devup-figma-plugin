import { afterEach, describe, expect, test } from 'bun:test'
import { textStyleToTypography } from '../text-style-to-typography'

function makeStyle(
  styleName: string,
  boundVariables?: Record<string, any>,
): TextStyle {
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
    boundVariables,
  } as unknown as TextStyle
}

describe('textStyleToTypography', () => {
  afterEach(() => {
    ;(globalThis as any).figma = undefined
  })

  test.each([
    ['Thin', 100],
    ['Extra Light', 200],
    ['Light', 300],
    ['4', 400],
    ['4 Normal', 400],
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
  ])('maps %s to fontWeight %d', async (styleName, expected) => {
    const result = await textStyleToTypography(makeStyle(styleName))
    expect(result.fontWeight).toBe(expected)
  })

  test('returns base typography when no boundVariables', async () => {
    const result = await textStyleToTypography(makeStyle('Regular'))
    expect(result.fontFamily).toBe('Pretendard')
    expect(result.fontSize).toBe('16px')
  })

  test('overrides fields with bound variable references', async () => {
    ;(globalThis as any).figma = {
      variables: {
        getVariableByIdAsync: async (id: string) => {
          const vars: Record<string, any> = {
            v1: { name: 'heading/size' },
            v2: { name: 'heading/line-height' },
            v3: { name: 'heading/spacing' },
            v4: { name: 'heading/weight' },
            v5: { name: 'heading/family' },
            v6: { name: 'heading/style' },
          }
          return vars[id] ?? null
        },
      },
    }
    const result = await textStyleToTypography(
      makeStyle('Regular', {
        fontSize: { type: 'VARIABLE_ALIAS', id: 'v1' },
        lineHeight: { type: 'VARIABLE_ALIAS', id: 'v2' },
        letterSpacing: { type: 'VARIABLE_ALIAS', id: 'v3' },
        fontWeight: { type: 'VARIABLE_ALIAS', id: 'v4' },
        fontFamily: { type: 'VARIABLE_ALIAS', id: 'v5' },
        fontStyle: { type: 'VARIABLE_ALIAS', id: 'v6' },
      }),
    )
    expect(result.fontSize).toBe('$headingSize')
    expect(result.lineHeight).toBe('$headingLineHeight')
    expect(result.letterSpacing).toBe('$headingSpacing')
    expect(result.fontWeight).toBe('$headingWeight')
    expect(result.fontFamily).toBe('$headingFamily')
    expect(result.fontStyle).toBe('$headingStyle')
  })

  test('keeps base value when variable not found', async () => {
    ;(globalThis as any).figma = {
      variables: {
        getVariableByIdAsync: async () => null,
      },
    }
    const result = await textStyleToTypography(
      makeStyle('Bold', {
        fontSize: { type: 'VARIABLE_ALIAS', id: 'missing' },
      }),
    )
    expect(result.fontSize).toBe('16px')
    expect(result.fontWeight).toBe(700)
  })
})
