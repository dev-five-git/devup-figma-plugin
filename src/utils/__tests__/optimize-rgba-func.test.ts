import { optimizeRgbaFunc } from '../optimize-rgba-func'

describe('optimizeRgbaFunc', () => {
  it('rgba()를 16진수로 변환한다', () => {
    expect(optimizeRgbaFunc('rgba(255, 0, 0, 1)')).toBe('#F00')
    expect(optimizeRgbaFunc('rgba(0, 255, 0, 0.5)')).toBe('#00FF0080')
    expect(optimizeRgbaFunc('rgba(0, 0, 255, 0.25)')).toBe('#0000FF40')
    expect(optimizeRgbaFunc('rgba(255,255,255,0)')).toBe('#FFF0')
    expect(optimizeRgbaFunc('rgba(12, 34, 56, 0.8)')).toBe('#0C2238CC')
  })

  it('rgb to hex', () => {
    expect(optimizeRgbaFunc('rgb(255, 0, 0)')).toBe('#F00')
    expect(optimizeRgbaFunc('rgb(0, 255, 0)')).toBe('#0F0')
    expect(optimizeRgbaFunc('rgb(0, 0, 255)')).toBe('#00F')
    expect(optimizeRgbaFunc('rgb(12, 34, 56)')).toBe('#0C2238')
  })

  it('문자열 내 여러 rgba/rgb를 모두 변환한다', () => {
    expect(
      optimizeRgbaFunc(
        'background: linear-gradient(rgba(255,0,0,1), rgb(0,255,0));',
      ),
    ).toBe('background: linear-gradient(#F00, #0F0);')
  })

  it('rgba/rgb가 없으면 원본을 반환한다', () => {
    expect(optimizeRgbaFunc('none')).toBe('none')
    expect(optimizeRgbaFunc('background: #fff;')).toBe('background: #fff;')
  })
})
