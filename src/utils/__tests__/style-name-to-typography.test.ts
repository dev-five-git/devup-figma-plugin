import { styleNameToTypography } from '../style-name-to-typography'

describe('styleNameToTypography', () => {
  it('should convert styleName to Typography', () => {
    expect(styleNameToTypography('mobile/font')).toEqual({
      level: 0,
      name: 'font',
    })

    expect(styleNameToTypography('desktop/font')).toEqual({
      level: 4,
      name: 'font',
    })

    expect(styleNameToTypography('tablet/font')).toEqual({
      level: 2,
      name: 'font',
    })

    expect(styleNameToTypography('mobile/font')).toEqual({
      level: 0,
      name: 'font',
    })
    expect(styleNameToTypography('mobile/font-name')).toEqual({
      level: 0,
      name: 'fontName',
    })
    expect(styleNameToTypography('font-name')).toEqual({
      level: 0,
      name: 'fontName',
    })
    expect(styleNameToTypography('4/font-name')).toEqual({
      level: 4,
      name: 'fontName',
    })

    expect(styleNameToTypography('4/fontName')).toEqual({
      level: 4,
      name: 'fontName',
    })
  })
})
