import { beforeEach, describe, expect, mock, test } from 'bun:test'
import {
  hasBoundVariable,
  resolveBoundVariable,
} from '../resolve-bound-variable'
import { resetVariableCache } from '../variable-cache'

describe('resolveBoundVariable', () => {
  beforeEach(() => {
    resetVariableCache()
  })

  test('returns variable token when bound variable exists', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getVariableByIdAsync: mock(async () => {
          return { name: 'shadow-color' }
        }),
      },
    } as unknown as typeof figma

    const result = await resolveBoundVariable(
      {
        paddingLeft: { id: 'var-padding-left' },
      },
      'paddingLeft',
    )

    expect(result).toBe('$shadowColor')
  })

  test('returns null when field has no bound variable', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getVariableByIdAsync: mock(async () => null),
      },
    } as unknown as typeof figma

    const result = await resolveBoundVariable(
      {
        paddingRight: { id: 'var-padding-right' },
      },
      'paddingLeft',
    )

    expect(result).toBeNull()
  })

  test('returns null when variable lookup has no name', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getVariableByIdAsync: mock(async () => {
          return { id: 'var-missing-name' }
        }),
      },
    } as unknown as typeof figma

    const result = await resolveBoundVariable(
      {
        paddingTop: { id: 'var-missing-name' },
      },
      'paddingTop',
    )

    expect(result).toBeNull()
  })
})

describe('hasBoundVariable', () => {
  test('returns true when field has a variable binding', () => {
    expect(
      hasBoundVariable(
        {
          cornerRadius: { id: 'var-corner-radius' },
        },
        'cornerRadius',
      ),
    ).toBe(true)
  })

  test('returns false when field does not have a variable binding', () => {
    expect(
      hasBoundVariable(
        {
          cornerRadius: { id: 'var-corner-radius' },
        },
        'topLeftRadius',
      ),
    ).toBe(false)
  })
})
