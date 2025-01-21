import { DevupTypography } from '../devup/types'

export function textSegmentToTypography(
  segment: StyledTextSegment,
): DevupTypography {
  return {
    fontFamily: segment.fontName.family,
    fontStyle: segment.fontName.style.includes('Italic') ? 'italic' : 'normal',
    fontWeight: segment.fontWeight,
    fontSize: segment.fontSize + 'px',
    textDecoration:
      segment.textDecoration.toLowerCase() === 'none'
        ? undefined
        : segment.textDecoration.toLowerCase(),
    textTransform:
      segment.textCase === 'ORIGINAL'
        ? undefined
        : segment.textCase.toLowerCase(),
    lineHeight:
      segment.lineHeight.unit === 'AUTO'
        ? 'normal'
        : segment.lineHeight.unit === 'PERCENT' && segment.lineHeight.value > 0
          ? segment.lineHeight.value / 100
          : segment.lineHeight.value + 'px',
    letterSpacing:
      segment.letterSpacing.unit === 'PERCENT' &&
      segment.letterSpacing.value > 0
        ? segment.letterSpacing.value / 100
        : segment.letterSpacing.value + 'px',
  }
}
