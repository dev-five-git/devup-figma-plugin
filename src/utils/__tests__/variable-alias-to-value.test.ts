import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { variableAliasToValue } from '../variable-alias-to-value'

beforeEach(() => {
  // Clear mocks if needed
})

describe('variableAliasToValue', () => {
  const getVariableByIdAsync = mock(
    (): Promise<Variable | null> => Promise.resolve(null),
  )
  ;(globalThis as { figma?: unknown }).figma = {
    variables: {
      getVariableByIdAsync,
    },
  } as unknown as typeof figma
  test('should convert variableAlias to value', async () => {
    getVariableByIdAsync.mockResolvedValue(null)
    expect(
      await variableAliasToValue(
        {
          id: 'id',
          type: 'VARIABLE_ALIAS',
        },
        'modeId',
      ),
    ).toBe(null)

    getVariableByIdAsync.mockResolvedValueOnce({
      valuesByMode: {
        modeId: {
          id: 'id',
          type: 'VARIABLE_ALIAS',
        },
      },
    } as unknown as Variable)
    getVariableByIdAsync.mockResolvedValueOnce({
      valuesByMode: {
        modeId: 'value',
      },
    } as unknown as Variable)
    expect(
      await variableAliasToValue(
        {
          id: 'id',
          type: 'VARIABLE_ALIAS',
        },
        'modeId',
      ),
    ).toBe('value')
  })
})
