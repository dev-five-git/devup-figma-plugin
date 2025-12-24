import { describe, expect, it } from 'bun:test'
import {
  createVariantPropValue,
  isVariantPropValue,
  mergePropsToVariant,
} from '../index'

describe('mergePropsToVariant', () => {
  it('returns props as-is for single variant', () => {
    const input = new Map([['scroll', { w: '100px', h: '200px' }]])
    const result = mergePropsToVariant('status', input)
    expect(result).toEqual({ w: '100px', h: '200px' })
  })

  it('returns single value when all variants have same value', () => {
    const input = new Map([
      ['scroll', { w: '100px' }],
      ['default', { w: '100px' }],
    ])
    const result = mergePropsToVariant('status', input)
    expect(result).toEqual({ w: '100px' })
  })

  it('creates VariantPropValue when variants have different values', () => {
    const input = new Map([
      ['scroll', { w: '100px' }],
      ['default', { w: '200px' }],
    ])
    const result = mergePropsToVariant('status', input)

    expect(isVariantPropValue(result.w)).toBe(true)
    const variantProp = result.w as ReturnType<typeof createVariantPropValue>
    expect(variantProp.variantKey).toBe('status')
    expect(variantProp.values).toEqual({ scroll: '100px', default: '200px' })
  })

  it('handles responsive arrays within variants', () => {
    const input = new Map([
      ['scroll', { w: ['10px', null, '20px'] }],
      ['default', { w: ['30px', null, '40px'] }],
    ])
    const result = mergePropsToVariant('status', input)

    expect(isVariantPropValue(result.w)).toBe(true)
    const variantProp = result.w as ReturnType<typeof createVariantPropValue>
    expect(variantProp.values).toEqual({
      scroll: ['10px', null, '20px'],
      default: ['30px', null, '40px'],
    })
  })

  it('filters out null values from variant object', () => {
    const input = new Map([
      ['scroll', { w: '100px' }],
      ['default', { w: null }],
    ])
    const result = mergePropsToVariant('status', input)

    expect(isVariantPropValue(result.w)).toBe(true)
    const variantProp = result.w as ReturnType<typeof createVariantPropValue>
    expect(variantProp.values).toEqual({ scroll: '100px' })
  })

  it('omits props when all values are null', () => {
    const input = new Map([
      ['scroll', { w: null }],
      ['default', { w: null }],
    ])
    const result = mergePropsToVariant('status', input)
    expect(result).toEqual({})
  })

  it('handles mixed props - some same, some different', () => {
    const input = new Map([
      ['scroll', { w: '100px', h: '200px', bg: 'red' }],
      ['default', { w: '100px', h: '300px', bg: 'blue' }],
    ])
    const result = mergePropsToVariant('status', input)

    // w should be single value (same in both)
    expect(result.w).toBe('100px')

    // h should be VariantPropValue (different)
    expect(isVariantPropValue(result.h)).toBe(true)
    const hProp = result.h as ReturnType<typeof createVariantPropValue>
    expect(hProp.values).toEqual({ scroll: '200px', default: '300px' })

    // bg should be VariantPropValue (different)
    expect(isVariantPropValue(result.bg)).toBe(true)
    const bgProp = result.bg as ReturnType<typeof createVariantPropValue>
    expect(bgProp.values).toEqual({ scroll: 'red', default: 'blue' })
  })

  it('handles props that exist only in some variants', () => {
    const input = new Map([
      ['scroll', { w: '100px', display: 'none' }],
      ['default', { w: '200px' }],
    ])
    const result = mergePropsToVariant('status', input)

    expect(isVariantPropValue(result.w)).toBe(true)
    expect(isVariantPropValue(result.display)).toBe(true)

    const displayProp = result.display as ReturnType<
      typeof createVariantPropValue
    >
    expect(displayProp.values).toEqual({ scroll: 'none' })
  })

  it('handles three or more variants', () => {
    const input = new Map([
      ['scroll', { w: '100px' }],
      ['default', { w: '200px' }],
      ['expanded', { w: '300px' }],
    ])
    const result = mergePropsToVariant('status', input)

    expect(isVariantPropValue(result.w)).toBe(true)
    const variantProp = result.w as ReturnType<typeof createVariantPropValue>
    expect(variantProp.values).toEqual({
      scroll: '100px',
      default: '200px',
      expanded: '300px',
    })
  })
})

describe('isVariantPropValue', () => {
  it('returns true for VariantPropValue', () => {
    const value = createVariantPropValue('status', { scroll: '10px' })
    expect(isVariantPropValue(value)).toBe(true)
  })

  it('returns false for plain object', () => {
    expect(isVariantPropValue({ a: 1 })).toBe(false)
  })

  it('returns false for array', () => {
    expect(isVariantPropValue([1, 2, 3])).toBe(false)
  })

  it('returns false for primitives', () => {
    expect(isVariantPropValue('string')).toBe(false)
    expect(isVariantPropValue(123)).toBe(false)
    expect(isVariantPropValue(null)).toBe(false)
    expect(isVariantPropValue(undefined)).toBe(false)
  })
})

describe('createVariantPropValue', () => {
  it('creates correct structure', () => {
    const value = createVariantPropValue('status', {
      scroll: '10px',
      default: '20px',
    })

    expect(value.__variantProp).toBe(true)
    expect(value.variantKey).toBe('status')
    expect(value.values).toEqual({ scroll: '10px', default: '20px' })
  })
})
