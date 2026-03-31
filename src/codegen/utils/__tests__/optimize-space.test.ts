import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { optimizeSpace, optimizeSpaceAsync } from '../optimize-space'
import { resetVariableCache } from '../variable-cache'

function setVariableMock(
  variableNameById: Record<string, string | null>,
): void {
  ;(globalThis as { figma?: unknown }).figma = {
    variables: {
      getVariableByIdAsync: mock(async (id: string) => {
        const name = variableNameById[id]
        if (!name) return null
        return { id, name }
      }),
    },
  } as unknown as typeof figma
}

describe('optimizeSpaceAsync', () => {
  beforeEach(() => {
    resetVariableCache()
  })

  test('falls back to sync optimizeSpace when no boundVariables', async () => {
    setVariableMock({})

    const result = await optimizeSpaceAsync('p', 8, 12, 8, 12, undefined)

    expect(result).toEqual(optimizeSpace('p', 8, 12, 8, 12))
  })

  test('falls back to sync optimizeSpace when bindings exist but variables do not resolve', async () => {
    setVariableMock({})

    const result = await optimizeSpaceAsync('p', 8, 12, 8, 12, {
      paddingTop: { id: 'var-padding-top' },
      paddingRight: { id: 'var-padding-right' },
      paddingBottom: { id: 'var-padding-bottom' },
      paddingLeft: { id: 'var-padding-left' },
    })

    expect(result).toEqual(optimizeSpace('p', 8, 12, 8, 12))
  })

  test('returns shorthand p when all sides resolve to same token', async () => {
    setVariableMock({
      'var-space': 'space-100',
    })

    const result = await optimizeSpaceAsync('p', 10, 20, 30, 40, {
      paddingTop: { id: 'var-space' },
      paddingRight: { id: 'var-space' },
      paddingBottom: { id: 'var-space' },
      paddingLeft: { id: 'var-space' },
    })

    expect(result).toEqual({ p: '$space100' })
  })

  test('supports margin field mapping with variable + raw mix', async () => {
    setVariableMock({
      'var-margin-top': 'layout/spacing/top',
    })

    const result = await optimizeSpaceAsync('m', 16, 8, 24, 8, {
      marginTop: { id: 'var-margin-top' },
    })

    expect(result).toEqual({
      mx: '8px',
      mt: '$layoutSpacingTop',
      mb: '24px',
    })
  })

  test('returns all individual sides when shorthand conditions do not match', async () => {
    setVariableMock({
      'var-padding-top': 'space/top',
      'var-padding-right': 'space/right',
    })

    const result = await optimizeSpaceAsync('p', 12, 24, 36, 48, {
      paddingTop: { id: 'var-padding-top' },
      paddingRight: { id: 'var-padding-right' },
    })

    expect(result).toEqual({
      pt: '$spaceTop',
      pr: '$spaceRight',
      pb: '36px',
      pl: '48px',
    })
  })

  test('returns py/px shorthand when vertical and horizontal sides match', async () => {
    setVariableMock({
      'var-y': 'space/y',
    })

    const result = await optimizeSpaceAsync('p', 16, 24, 16, 24, {
      paddingTop: { id: 'var-y' },
      paddingBottom: { id: 'var-y' },
    })

    expect(result).toEqual({
      py: '$spaceY',
      px: '24px',
    })
  })

  test('returns py + side props when only top and bottom match', async () => {
    setVariableMock({
      'var-y': 'space/y',
      'var-right': 'space/right',
    })

    const result = await optimizeSpaceAsync('p', 16, 24, 16, 40, {
      paddingTop: { id: 'var-y' },
      paddingBottom: { id: 'var-y' },
      paddingRight: { id: 'var-right' },
    })

    expect(result).toEqual({
      py: '$spaceY',
      pr: '$spaceRight',
      pl: '40px',
    })
  })
})
