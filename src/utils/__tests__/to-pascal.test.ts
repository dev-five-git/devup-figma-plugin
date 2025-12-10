import { describe, expect, test } from 'bun:test'
import { toPascal } from '../to-pascal'

describe('toPascal', () => {
  test('should convert to pascal case', () => {
    expect(toPascal('to-camel')).toBe('ToCamel')
    expect(toPascal('to/camel')).toBe('ToCamel')
    expect(toPascal('toCamel')).toBe('ToCamel')
    expect(toPascal('to/toCamel')).toBe('ToToCamel')
    expect(toPascal('to-came/toCamel/ToCamel')).toBe('ToCameToCamelToCamel')
    expect(toPascal('TO_CAMEL')).toBe('ToCamel')
    expect(toPascal('TO-CAMEL')).toBe('ToCamel')
    expect(toPascal('ToCamel')).toBe('ToCamel')
    expect(toPascal('TO CAMEL')).toBe('ToCamel')
    expect(toPascal('to_Camel')).toBe('ToCamel')
    expect(toPascal('to camel')).toBe('ToCamel')
    expect(toPascal('To camel')).toBe('ToCamel')
    expect(toPascal('DEVUPStyle')).toBe('DevupStyle')
    expect(toPascal('buttonLabel')).toBe('ButtonLabel')
    expect(toPascal('buttonL')).toBe('ButtonL')
    expect(toPascal('')).toBe('')
  })
})
