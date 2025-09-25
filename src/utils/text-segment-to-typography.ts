import { DevupTypography } from '../commands/devup/types'

export function textSegmentToTypography(
  segment: Pick<
    StyledTextSegment,
    | 'fontName'
    | 'fontWeight'
    | 'fontSize'
    | 'textDecoration'
    | 'textCase'
    | 'lineHeight'
    | 'letterSpacing'
  >,
): DevupTypography {
  return {
    fontFamily: segment.fontName.family,
    fontStyle: segment.fontName.style.includes('Italic') ? 'italic' : undefined,
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
        : segment.lineHeight.unit === 'PERCENT'
          ? Math.round(segment.lineHeight.value / 10) / 10
          : segment.lineHeight.value + 'px',
    letterSpacing:
      segment.letterSpacing.unit === 'PERCENT'
        ? `${Math.round(segment.letterSpacing.value) / 100}em`
        : segment.letterSpacing.value + 'px',
  }
}
