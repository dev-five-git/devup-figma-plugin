import type { DevupTypography } from './types'

export async function applyTypography(
  target: string,
  typography: DevupTypography,
  styles: TextStyle[],
) {
  const st = styles.find((s) => s.name === target) ?? figma.createTextStyle()
  st.name = target
  const fontFamily = {
    family: typography.fontFamily ?? 'Inter',
    style: typography.fontStyle === 'italic' ? 'Italic' : 'Regular',
  }

  try {
    await figma.loadFontAsync(fontFamily)
    st.fontName = fontFamily
    if (typography.fontSize) st.fontSize = parseInt(typography.fontSize, 10)
    if (typography.letterSpacing) {
      st.letterSpacing = typography.letterSpacing.endsWith('em')
        ? {
            unit: 'PERCENT',
            value: parseFloat(typography.letterSpacing),
          }
        : {
            unit: 'PIXELS',
            value: parseFloat(typography.letterSpacing) * 100,
          }
    }
    if (typography.lineHeight) {
      st.lineHeight =
        typography.lineHeight === 'normal'
          ? { unit: 'AUTO' }
          : typeof typography.lineHeight === 'string'
            ? {
                unit: 'PIXELS',
                value: parseInt(typography.lineHeight, 10),
              }
            : {
                unit: 'PERCENT',
                value: Math.round(typography.lineHeight / 10) / 10,
              }
    }
    if (typography.textTransform) {
      st.textCase = typography.textTransform.toUpperCase() as TextCase
    }
    if (typography.textDecoration) {
      st.textDecoration =
        typography.textDecoration.toUpperCase() as TextDecoration
    }
  } catch (error) {
    console.error('Failed to create text style', error)
    figma.notify(
      `Failed to create text style (${target}, ${fontFamily.family} - ${fontFamily.style})`,
      { error: true },
    )
  }
}
