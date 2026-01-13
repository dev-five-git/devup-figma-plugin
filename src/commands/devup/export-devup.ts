import { downloadFile } from '../../utils/download-file'
import { isVariableAlias } from '../../utils/is-variable-alias'
import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { styleNameToTypography } from '../../utils/style-name-to-typography'
import { textSegmentToTypography } from '../../utils/text-segment-to-typography'
import { textStyleToTypography } from '../../utils/text-style-to-typography'
import { toCamel } from '../../utils/to-camel'
import { variableAliasToValue } from '../../utils/variable-alias-to-value'
import type { Devup, DevupTypography } from './types'
import { downloadDevupXlsx } from './utils/download-devup-xlsx'
import { getDevupColorCollection } from './utils/get-devup-color-collection'

/**
 * Generate Devup configuration object from Figma design system.
 * This function extracts colors and typography from the current Figma file.
 */
export async function generateDevupConfig(
  treeshaking: boolean = true,
): Promise<Devup> {
  const devup: Devup = {}

  const collection = await getDevupColorCollection()
  if (collection) {
    for (const mode of collection.modes) {
      devup.theme ??= {}
      devup.theme.colors ??= {}
      const colors: Record<string, string> = {}
      devup.theme.colors[mode.name.toLowerCase()] = colors
      await Promise.all(
        collection.variableIds.map(async (varId) => {
          const variable = await figma.variables.getVariableByIdAsync(varId)
          if (variable === null) return
          const value = variable.valuesByMode[mode.modeId]
          if (typeof value === 'boolean' || typeof value === 'number') return
          if (isVariableAlias(value)) {
            const nextValue = await variableAliasToValue(value, mode.modeId)
            if (nextValue === null) return
            if (typeof nextValue === 'boolean' || typeof nextValue === 'number')
              return
            colors[toCamel(variable.name)] = optimizeHex(
              rgbaToHex(figma.util.rgba(nextValue)),
            )
          } else {
            colors[toCamel(variable.name)] = optimizeHex(
              rgbaToHex(figma.util.rgba(value)),
            )
          }
        }),
      )
    }
  }

  await figma.loadAllPagesAsync()

  const textStyles = await figma.getLocalTextStylesAsync()
  const ids = new Set()
  const styles: Record<string, TextStyle> = {}
  for (const style of textStyles) {
    ids.add(style.id)
    styles[style.name] = style
  }

  const typography: Record<string, (null | DevupTypography)[]> = {}
  if (treeshaking) {
    const texts = figma.root.findAllWithCriteria({ types: ['TEXT'] })
    await Promise.all(
      texts
        .filter(
          (text) =>
            (typeof text.textStyleId === 'string' && text.textStyleId) ||
            text.textStyleId === figma.mixed,
        )
        .map(async (text) => {
          for (const seg of text.getStyledTextSegments([
            'fontName',
            'fontWeight',
            'fontSize',
            'textDecoration',
            'textCase',
            'lineHeight',
            'letterSpacing',
            'fills',
            'textStyleId',
            'fillStyleId',
            'listOptions',
            'indentation',
            'hyperlink',
          ])) {
            if (seg?.textStyleId) {
              const style = await figma.getStyleByIdAsync(seg.textStyleId)

              if (!(style && ids.has(style.id))) continue
              const { level, name } = styleNameToTypography(style.name)
              const typo = textSegmentToTypography(seg)
              if (typography[name]?.[level]) continue
              typography[name] ??= [null, null, null, null, null, null]
              typography[name][level] = typo
            }
          }
        }),
    )
  } else {
    for (const [styleName, style] of Object.entries(styles)) {
      const { level, name } = styleNameToTypography(styleName)
      const typo = textStyleToTypography(style)
      if (typography[name]?.[level]) continue
      typography[name] ??= [null, null, null, null, null, null]
      typography[name][level] = typo
    }
  }

  for (const [name, style] of Object.entries(styles)) {
    const { level, name: styleName } = styleNameToTypography(name)
    if (typography[styleName] && !typography[styleName][level]) {
      typography[styleName][level] = textStyleToTypography(style)
    }
  }

  if (Object.keys(typography).length > 0) {
    devup.theme ??= {}
    devup.theme.typography = Object.entries(typography).reduce(
      (acc, [key, value]) => {
        const filtered = value.filter((v) => v !== null)
        if (filtered.length === 0) {
          return acc
        }
        if (filtered.length === 1) {
          acc[key] = filtered[0]
          return acc
        }
        if (value[0] === null) {
          acc[key] = [filtered[0]]
          for (let i = 1; i < value.length; i += 1) {
            acc[key].push(value[i])
          }
          while (acc[key][acc[key].length - 1] === null) {
            acc[key].pop()
          }
          return acc
        }
        acc[key] = value
        return acc
      },
      {} as Record<string, DevupTypography | (null | DevupTypography)[]>,
    )
  }

  return devup
}

export async function exportDevup(
  output: 'json' | 'excel',
  treeshaking: boolean = true,
) {
  const devup = await generateDevupConfig(treeshaking)

  switch (output) {
    case 'json':
      return downloadFile('devup.json', JSON.stringify(devup))
    case 'excel':
      return downloadDevupXlsx('devup.xlsx', JSON.stringify(devup))
  }
}
