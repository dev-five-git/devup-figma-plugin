import { styleNameToTypography } from '../style-name-to-typography'

describe('styleNameToTypography', () => {
  it('should convert styleName to Typography', () => {
    expect(styleNameToTypography('mobile-font')).toEqual({
      type: 'mobile',
      name: 'mobile-font',
    })

    expect(styleNameToTypography('desktop/font')).toEqual({
      type: 'desktop',
      name: 'font',
    })

    expect(styleNameToTypography('tablet/font')).toEqual({
      type: 'tablet',
      name: 'font',
    })

    expect(styleNameToTypography('mobile/font')).toEqual({
      type: 'mobile',
      name: 'font',
    })
  })
})
