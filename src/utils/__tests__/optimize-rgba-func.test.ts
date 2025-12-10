import { describe, expect, test } from 'bun:test'
import { optimizeRgbaFunc } from '../optimize-rgba-func'

describe('optimizeRgbaFunc', () => {
  test('converts rgba() to hex', () => {
    expect(optimizeRgbaFunc('rgba(255, 0, 0, 1)')).toBe('#F00')
    expect(optimizeRgbaFunc('rgba(0, 255, 0, 0.5)')).toBe('#00FF0080')
    expect(optimizeRgbaFunc('rgba(0, 0, 255, 0.25)')).toBe('#0000FF40')
    expect(optimizeRgbaFunc('rgba(255,255,255,0)')).toBe('#FFF0')
    expect(optimizeRgbaFunc('rgba(12, 34, 56, 0.8)')).toBe('#0C2238CC')
  })

  test('rgb to hex', () => {
    expect(optimizeRgbaFunc('rgb(255, 0, 0)')).toBe('#F00')
    expect(optimizeRgbaFunc('rgb(0, 255, 0)')).toBe('#0F0')
    expect(optimizeRgbaFunc('rgb(0, 0, 255)')).toBe('#00F')
    expect(optimizeRgbaFunc('rgb(12, 34, 56)')).toBe('#0C2238')
  })

  test('converts multiple rgba/rgb in string', () => {
    expect(
      optimizeRgbaFunc(
        'background: linear-gradient(rgba(255,0,0,1), rgb(0,255,0));',
      ),
    ).toBe('background: linear-gradient(#F00, #0F0);')
  })

  test('returns original when rgba/rgb not present', () => {
    expect(optimizeRgbaFunc('none')).toBe('none')
    expect(optimizeRgbaFunc('background: #fff;')).toBe('background: #fff;')
  })
})
