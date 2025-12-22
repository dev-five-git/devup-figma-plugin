import { describe, expect, test } from 'bun:test'
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
})
