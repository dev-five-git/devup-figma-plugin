import { afterEach, describe, expect, test } from 'bun:test'
import { resolveTextStyleBoundVariable } from '../resolve-text-style-bound-variable'

describe('resolveTextStyleBoundVariable', () => {
  afterEach(() => {
    ;(globalThis as any).figma = undefined
  })

  test('returns null when boundVariables is undefined', async () => {
    expect(
      await resolveTextStyleBoundVariable(undefined, 'fontSize'),
    ).toBeNull()
  })

  test('returns null when field is not bound', async () => {
    expect(
      await resolveTextStyleBoundVariable({} as any, 'fontSize'),
    ).toBeNull()
  })

  test('returns null when variable is not found', async () => {
    ;(globalThis as any).figma = {
      variables: {
        getVariableByIdAsync: async () => null,
      },
    }
    expect(
      await resolveTextStyleBoundVariable(
        { fontSize: { type: 'VARIABLE_ALIAS', id: 'var1' } } as any,
        'fontSize',
      ),
    ).toBeNull()
  })

  test('returns $camelName when variable is found', async () => {
    ;(globalThis as any).figma = {
      variables: {
        getVariableByIdAsync: async () => ({ name: 'heading/font-size' }),
      },
    }
    expect(
      await resolveTextStyleBoundVariable(
        { fontSize: { type: 'VARIABLE_ALIAS', id: 'var1' } } as any,
        'fontSize',
      ),
    ).toBe('$headingFontSize')
  })

  test('returns null when variable has no name', async () => {
    ;(globalThis as any).figma = {
      variables: {
        getVariableByIdAsync: async () => ({ name: '' }),
      },
    }
    expect(
      await resolveTextStyleBoundVariable(
        { fontSize: { type: 'VARIABLE_ALIAS', id: 'var1' } } as any,
        'fontSize',
      ),
    ).toBeNull()
  })
})
