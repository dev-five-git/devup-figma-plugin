import type { DevupTypography } from '../commands/devup/types'
import { resolveTextStyleBoundVariable } from './resolve-text-style-bound-variable'
import { textSegmentToTypography } from './text-segment-to-typography'
import { toCamel } from './to-camel'

export async function textStyleToTypography(
  style: TextStyle,
): Promise<DevupTypography> {
  const base = textSegmentToTypography({
    fontName: style.fontName,
    fontWeight: getFontWeight(style.fontName.style),
    fontSize: style.fontSize,
    textDecoration: style.textDecoration,
    textCase: style.textCase,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
  })

  const boundVars = style.boundVariables
  if (!boundVars) return base

  const [
    fontFamily,
    fontSize,
    fontStyle,
    fontWeight,
    letterSpacing,
    lineHeight,
  ] = await Promise.all([
    resolveTextStyleBoundVariable(boundVars, 'fontFamily'),
    resolveTextStyleBoundVariable(boundVars, 'fontSize'),
    resolveTextStyleBoundVariable(boundVars, 'fontStyle'),
    resolveTextStyleBoundVariable(boundVars, 'fontWeight'),
    resolveTextStyleBoundVariable(boundVars, 'letterSpacing'),
    resolveTextStyleBoundVariable(boundVars, 'lineHeight'),
  ])

  if (fontFamily) base.fontFamily = fontFamily
  if (fontSize) base.fontSize = fontSize
  if (fontStyle) base.fontStyle = fontStyle
  if (fontWeight) base.fontWeight = fontWeight
  if (letterSpacing) base.letterSpacing = letterSpacing
  if (lineHeight) base.lineHeight = lineHeight

  return base
}

function getFontWeight(weight: string): number {
  switch (toCamel(weight)) {
    case 'thin':
      return 100
    case 'extralight':
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
    case 'semiBold':
      return 600
    case 'bold':
      return 700
    case 'extrabold':
    case 'extraBold':
      return 800
    case 'black':
    case 'heavy':
      return 900
  }

  const weightNumber = Number.parseInt(weight, 10)
  if (
    Number.isInteger(weightNumber) &&
    weightNumber >= 1 &&
    weightNumber <= 9
  ) {
    return weightNumber * 100
  }
  return Number.isNaN(weightNumber) ? 400 : weightNumber
}
