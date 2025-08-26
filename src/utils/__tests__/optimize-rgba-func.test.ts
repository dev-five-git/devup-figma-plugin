import { optimizeRgbaFunc } from '../optimize-rgba-func'

describe('optimizeRgbaFunc', () => {
  it('rgba()를 16진수로 변환한다', () => {
    expect(optimizeRgbaFunc('rgba(255, 0, 0, 1)')).toBe('#FF0000FF')
    expect(optimizeRgbaFunc('rgba(0, 255, 0, 0.5)')).toBe('#00FF007F')
    expect(optimizeRgbaFunc('rgba(0, 0, 255, 0.25)')).toBe('#0000FF40')
    expect(optimizeRgbaFunc('rgba(255,255,255,0)')).toBe('#FFFFFF00')
    expect(optimizeRgbaFunc('rgba(12, 34, 56, 0.8)')).toBe('#0C2236CC')
  })

  it('rgb to hex', () => {
    expect(optimizeRgbaFunc('rgb(255, 0, 0)')).toBe('#FF0000FF')
    expect(optimizeRgbaFunc('rgb(0, 255, 0)')).toBe('#00FF00FF')
    expect(optimizeRgbaFunc('rgb(0, 0, 255)')).toBe('#0000FFFF')
    expect(optimizeRgbaFunc('rgb(12, 34, 56)')).toBe('#0C2236FF')
  })

  it('문자열 내 여러 rgba/rgb를 모두 변환한다', () => {
    expect(
      optimizeRgbaFunc(
        'background: linear-gradient(rgba(255,0,0,1), rgb(0,255,0));',
      ),
    ).toBe('background: linear-gradient(#FF0000FF, #00FF00FF);')
  })

  it('rgba/rgb가 없으면 원본을 반환한다', () => {
    expect(optimizeRgbaFunc('none')).toBe('none')
    expect(optimizeRgbaFunc('background: #fff;')).toBe('background: #fff;')
  })
})
