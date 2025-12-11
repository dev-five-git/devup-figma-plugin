import { describe, expect, test } from 'bun:test'
import { extractKeyValueFromCssVar } from '../extract-key-value-from-css-var'

describe('extractKeyValueFromCssVar', () => {
  test('should extract value from css var', () => {
    expect(extractKeyValueFromCssVar('var(--primary)')).toBeUndefined()
    expect(extractKeyValueFromCssVar('var(--primary, red)')).toEqual([
      '$primary',
      'red',
    ])
    expect(extractKeyValueFromCssVar('var(--primary, #0d0d0d)')).toEqual([
      '$primary',
      '#0d0d0d',
    ])
  })
})
