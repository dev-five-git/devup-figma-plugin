import { toCamel } from '../to-camel'

describe('toCamel', () => {
  it('should convert camel', () => {
    expect(toCamel('to-camel')).toBe('toCamel')
    expect(toCamel('toCamel')).toBe('toCamel')
    expect(toCamel('to_Camel')).toBe('toCamel')
    expect(toCamel('to camel')).toBe('toCamel')
    expect(toCamel('To camel')).toBe('toCamel')
    expect(toCamel('')).toBe('')
  })
})
