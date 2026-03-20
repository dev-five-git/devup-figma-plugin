import { describe, expect, test } from 'bun:test'
import { getComponentPropertyDefinitions } from '../get-component-property-definitions'

describe('getComponentPropertyDefinitions', () => {
  test('returns definitions from a valid node', () => {
    const defs = {
      status: {
        type: 'VARIANT',
        defaultValue: 'active',
        variantOptions: ['active', 'inactive'],
      },
    }
    const node = {
      componentPropertyDefinitions: defs,
    } as unknown as ComponentSetNode

    expect(getComponentPropertyDefinitions(node)).toBe(
      defs as ComponentPropertyDefinitions,
    )
  })

  test('returns empty object when node is null', () => {
    expect(getComponentPropertyDefinitions(null)).toEqual({})
  })

  test('returns empty object when node is undefined', () => {
    expect(getComponentPropertyDefinitions(undefined)).toEqual({})
  })

  test('returns empty object when getter throws', () => {
    const node = {
      get componentPropertyDefinitions(): never {
        throw new Error(
          'in get_componentPropertyDefinitions: Component set has existing errors',
        )
      },
    } as unknown as ComponentSetNode

    expect(getComponentPropertyDefinitions(node)).toEqual({})
  })
})
