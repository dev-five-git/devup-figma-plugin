import { variableAliasToValue } from '../variable-alias-to-value'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('variableAliasToValue', () => {
  const getVariableByIdAsync = vi.fn()
  ;(globalThis as any).figma = {
    variables: {
      getVariableByIdAsync,
    },
  } as any
  it('should convert variableAlias to value', async () => {
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
    })
    getVariableByIdAsync.mockResolvedValueOnce({
      valuesByMode: {
        modeId: 'value',
      },
    })
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
