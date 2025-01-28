import { textSegmentToTypography } from '../text-segment-to-typography'

describe('textSegmentToTypography', () => {
  it('should convert variableAlias to value', async () => {
    expect(
      textSegmentToTypography({
        fontName: {
          family: 'Roboto',
          style: 'Italic',
        },
        fontWeight: 400,
        fontSize: 16,
        textDecoration: 'NONE',
        textCase: 'ORIGINAL',
        lineHeight: {
          unit: 'PERCENT',
          value: 100,
        },
        letterSpacing: {
          unit: 'PIXELS',
          value: 0,
        },
      }),
    ).toEqual({
      fontFamily: 'Roboto',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: '16px',
      textDecoration: undefined,
      textTransform: undefined,
      lineHeight: 1,
      letterSpacing: '0px',
    })

    expect(
      textSegmentToTypography({
        fontName: {
          family: 'Roboto',
          style: 'Italic',
        },
        fontWeight: 400,
        fontSize: 16,
        textDecoration: 'UNDERLINE',
        textCase: 'UPPER',
        lineHeight: {
          unit: 'AUTO',
        },
        letterSpacing: {
          unit: 'PIXELS',
          value: 0,
        },
      }),
    ).toEqual({
      fontFamily: 'Roboto',
      fontStyle: 'italic',
      fontWeight: 400,
      fontSize: '16px',
      textDecoration: 'underline',
      textTransform: 'upper',
      lineHeight: 'normal',
      letterSpacing: '0px',
    })

    expect(
      textSegmentToTypography({
        fontName: {
          family: 'Roboto',
          style: 'normal',
        },
        fontWeight: 400,
        fontSize: 16,
        textDecoration: 'UNDERLINE',
        textCase: 'UPPER',
        lineHeight: {
          unit: 'PIXELS',
          value: 0,
        },
        letterSpacing: {
          unit: 'PERCENT',
          value: 10,
        },
      }),
    ).toEqual({
      fontFamily: 'Roboto',
      fontStyle: 'normal',
      fontWeight: 400,
      fontSize: '16px',
      textDecoration: 'underline',
      textTransform: 'upper',
      lineHeight: '0px',
      letterSpacing: '0.1em',
    })

    expect(
      textSegmentToTypography({
        fontName: {
          family: 'Roboto',
          style: 'normal',
        },
        fontWeight: 400,
        fontSize: 16,
        textDecoration: 'UNDERLINE',
        textCase: 'UPPER',
        lineHeight: {
          unit: 'PERCENT',
          value: 139,
        },
        letterSpacing: {
          unit: 'PERCENT',
          value: 10,
        },
      }),
    ).toEqual({
      fontFamily: 'Roboto',
      fontStyle: 'normal',
      fontWeight: 400,
      fontSize: '16px',
      textDecoration: 'underline',
      textTransform: 'upper',
      lineHeight: 1.4,
      letterSpacing: '0.1em',
    })
  })
})
