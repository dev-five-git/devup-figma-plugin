import { isVariableAlias } from '../is-variable-alias'

describe('isVariableAlias', () => {
  it('should check variableAlias', () => {
    expect(
      isVariableAlias({
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      }),
    ).toBe(false)

    expect(isVariableAlias(null)).toBe(false)
    expect(isVariableAlias(undefined)).toBe(false)
    expect(
      isVariableAlias({
        id: 'id',
        type: 'VARIABLE_ALIAS',
      }),
    ).toBe(true)
  })
})
