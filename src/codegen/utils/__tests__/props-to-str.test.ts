import { describe, expect, test } from 'bun:test'
import { createVariantPropValue } from '../../responsive'
import { propsToString } from '../props-to-str'

describe('propsToString', () => {
  test('sorts uppercase keys first and formats booleans/strings', () => {
    const res = propsToString({ Z: '1', a: '2', b: false })
    expect(res.split(' ')).toContain('Z="1"')
    expect(res.split(' ')).toContain('b={false}')
  })

  test('omits assignment for boolean true', () => {
    const res = propsToString({ Active: true, label: 'ok' })
    expect(res).toContain('Active')
    expect(res).not.toContain('Active={true}')
  })

  test('sort comparator handles lower then upper keys', () => {
    const res = propsToString({ b: '1', A: '2' })
    expect(res.startsWith('A="2"')).toBe(true)
  })

  test('formats objects with newlines when many props', () => {
    const res = propsToString({
      a: '1',
      b: { x: 1 },
      c: '3',
      d: '4',
      e: '5',
    })
    expect(res).toContain('\n')
    expect(res).toContain(`b={${JSON.stringify({ x: 1 }, null, 2)}}`)
  })

  test('handles empty props', () => {
    expect(propsToString({})).toBe('')
  })

  test('handles animationName with keyframes function', () => {
    const res = propsToString({
      animationName: 'keyframes({"0%":{"opacity":0},"100%":{"opacity":1}})',
    })
    expect(res).toContain('animationName={keyframes(')
    expect(res).toContain('"0%"')
    expect(res).toContain('"100%"')
  })

  test('handles animationName with invalid keyframes JSON', () => {
    const res = propsToString({
      animationName: 'keyframes(invalid-json)',
    })
    expect(res).toBe('animationName={keyframes(invalid-json)}')
  })

  test('handles animationName starting with keyframes but no parentheses match', () => {
    const res = propsToString({
      animationName: 'keyframes(',
    })
    expect(res).toBe('animationName={keyframes(}')
  })

  test('handles animationName without keyframes prefix', () => {
    const res = propsToString({
      animationName: 'fadeIn',
    })
    expect(res).toBe('animationName="fadeIn"')
  })

  test('handles object values', () => {
    const res = propsToString({
      style: { color: 'red', fontSize: 16 },
    })
    expect(res).toContain('style={')
    expect(res).toContain('"color": "red"')
  })

  test('handles VariantPropValue with simple values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: '10px',
      default: '20px',
    })
    const res = propsToString({ w: variantProp })
    expect(res).toBe('w={{ scroll: "10px", default: "20px" }[status]}')
  })

  test('handles VariantPropValue with array values (responsive)', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: ['10px', null, '20px'],
      default: ['30px', null, '40px'],
    })
    const res = propsToString({ w: variantProp })
    // Array values trigger multiline format
    expect(res).toContain('scroll: ["10px", null, "20px"]')
    expect(res).toContain('default: ["30px", null, "40px"]')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with numeric values', () => {
    const variantProp = createVariantPropValue('size', {
      sm: 10,
      lg: 20,
    })
    const res = propsToString({ gap: variantProp })
    expect(res).toBe('gap={{ sm: 10, lg: 20 }[size]}')
  })

  test('VariantPropValue does not trigger newline separator', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: '10px',
      default: '20px',
    })
    const res = propsToString({
      w: variantProp,
      h: '100px',
      bg: 'red',
    })
    // Should use space separator, not newline
    expect(res).not.toContain('\n')
  })

  test('handles VariantPropValue with object values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: { x: 1, y: 2 },
      default: { x: 3, y: 4 },
    })
    const res = propsToString({ transform: variantProp })
    // Object values trigger multiline format with proper indentation
    expect(res).toContain('scroll:')
    expect(res).toContain('"x": 1')
    expect(res).toContain('"y": 2')
    expect(res).toContain('default:')
    expect(res).toContain('"x": 3')
    expect(res).toContain('"y": 4')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with boolean values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: true,
      default: false,
    })
    const res = propsToString({ visible: variantProp })
    expect(res).toBe('visible={{ scroll: true, default: false }[status]}')
  })

  test('handles VariantPropValue with undefined values in array', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: [undefined, '10px'],
      default: ['20px', undefined],
    })
    const res = propsToString({ w: variantProp })
    // Array values trigger multiline format
    expect(res).toContain('scroll: [undefined, "10px"]')
    expect(res).toContain('default: ["20px", undefined]')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with symbol values (fallback case)', () => {
    const sym = Symbol('test')
    const variantProp = createVariantPropValue('status', {
      scroll: sym as unknown as string,
      default: '20px',
    })
    const res = propsToString({ w: variantProp })
    expect(res).toContain('scroll: Symbol(test)')
    expect(res).toContain('default: "20px"')
  })
})
