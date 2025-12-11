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
})
