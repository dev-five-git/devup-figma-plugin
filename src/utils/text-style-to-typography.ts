import { DevupTypography } from '../commands/devup/types'
import { textSegmentToTypography } from './text-segment-to-typography'
import { toCamel } from './to-camel'

export function textStyleToTypography(style: TextStyle): DevupTypography {
  return textSegmentToTypography({
    fontName: style.fontName,
    fontWeight: getFontWeight(style.fontName.style),
    fontSize: style.fontSize,
    textDecoration: style.textDecoration,
    textCase: style.textCase,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  })
}

function getFontWeight(weight: string): number {
  switch (toCamel(weight)) {
    case 'thin':
      return 100
    case 'extraLight':
      return 200
    case 'light':
      return 300
    case 'normal':
    case 'regular':
      return 400
    case 'medium':
      return 500
    case 'semibold':
      return 600
    case 'bold':
      return 700
    case 'extraBold':
      return 800
    case 'black':
    case 'heavy':
      return 900
    default: {
      const weightNumber = parseInt(weight)
      if (!isNaN(weightNumber)) return weightNumber
      return 400
    }
  }
}
