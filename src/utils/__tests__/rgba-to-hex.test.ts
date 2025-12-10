import { describe, expect, test } from 'bun:test'
import { rgbaToHex } from '../rgba-to-hex'

describe('rgbaToHex', () => {
  test('should convert rgba to hex', () => {
    expect(
      rgbaToHex({
        r: 0,
        g: 0,
        b: 0,
        a: 0,
      }),
    ).toBe('#00000000')
    expect(
      rgbaToHex({
        r: 0,
        g: 0,
        b: 0,
        a: 0.5,
      }),
    ).toBe('#00000080')
    expect(
      rgbaToHex({
        r: 1,
        g: 1,
        b: 1,
        a: 1,
      }),
    ).toBe('#FFFFFFFF')
    expect(
      rgbaToHex({
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      }),
    ).toBe('#000000FF')
  })
})
