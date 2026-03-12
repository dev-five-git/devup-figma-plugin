import {
  perfEnd,
  perfReport,
  perfReset,
  perfStart,
} from '../../codegen/utils/perf'
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

export async function exportDevup(
  output: 'json' | 'excel',
  treeshaking: boolean = true,
) {
  perfReset()
  const t = perfStart()
  const devup: Devup = {}

  const tColors = perfStart()
  const collection = await getDevupColorCollection()
  if (collection) {
    // Pre-fetch all variables once — reuse across modes
    const variables = await Promise.all(
      collection.variableIds.map((varId) =>
        figma.variables.getVariableByIdAsync(varId),
      ),
    )
    devup.theme ??= {}
    devup.theme.colors ??= {}
    for (const mode of collection.modes) {
      const colors: Record<string, string> = {}
      devup.theme.colors[mode.name.toLowerCase()] = colors
      await Promise.all(
        variables.map(async (variable) => {
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
  perfEnd('exportDevup.colors', tColors)

  // Parallel: load pages (only if treeshaking) + fetch text styles
  const tLoad = perfStart()
  const [, textStyles] = await Promise.all([
    treeshaking ? figma.loadAllPagesAsync() : Promise.resolve(),
    figma.getLocalTextStylesAsync(),
  ])
  perfEnd('exportDevup.load', tLoad)

  // Build both ID-keyed and name-keyed maps from a single fetch
  const stylesById = new Map<string, TextStyle>()
  const styles: Record<string, TextStyle> = {}
  for (const style of textStyles) {
    stylesById.set(style.id, style)
    styles[style.name] = style
  }

  const tTypo = perfStart()
  const typography: Record<string, (null | DevupTypography)[]> = {}
  if (treeshaking) {
    // Skip hidden instance children — can make findAllWithCriteria dramatically faster
    const prevSkip = figma.skipInvisibleInstanceChildren
    figma.skipInvisibleInstanceChildren = true

    const tFind = perfStart()
    const texts = figma.root.findAllWithCriteria({ types: ['TEXT'] })
    perfEnd('exportDevup.typography.find', tFind)

    const tScan = perfStart()
    const foundStyleIds = new Set<string>()
    for (const text of texts) {
      // Early exit: all local styles discovered
      if (foundStyleIds.size >= stylesById.size) break
      if (
        !(typeof text.textStyleId === 'string' && text.textStyleId) &&
        text.textStyleId !== figma.mixed
      )
        continue
      // Short-circuit: single-style nodes whose style is not local
      if (
        typeof text.textStyleId === 'string' &&
        !stylesById.has(text.textStyleId)
      )
        continue
      // Skip single-style nodes whose style is already found
      if (
        typeof text.textStyleId === 'string' &&
        foundStyleIds.has(text.textStyleId)
      )
        continue
      for (const seg of text.getStyledTextSegments([
        'fontName',
        'fontWeight',
        'fontSize',
        'textDecoration',
        'textCase',
        'lineHeight',
        'letterSpacing',
        'textStyleId',
      ])) {
        if (seg?.textStyleId) {
          if (foundStyleIds.has(seg.textStyleId)) continue
          // Sync lookup — no async IPC per segment
          const style = stylesById.get(seg.textStyleId)
          if (!style) continue
          foundStyleIds.add(seg.textStyleId)
          const { level, name } = styleNameToTypography(style.name)
          const typo = textSegmentToTypography(seg)
          if (typography[name]?.[level]) continue
          typography[name] ??= [null, null, null, null, null, null]
          typography[name][level] = typo
        }
      }
    }
    perfEnd('exportDevup.typography.scan', tScan)

    figma.skipInvisibleInstanceChildren = prevSkip
  } else {
    for (const [styleName, style] of Object.entries(styles)) {
      const { level, name } = styleNameToTypography(styleName)
      const typo = textStyleToTypography(style)
      if (typography[name]?.[level]) continue
      typography[name] ??= [null, null, null, null, null, null]
      typography[name][level] = typo
    }
  }
  perfEnd('exportDevup.typography', tTypo)

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

  perfEnd('exportDevup()', t)
  console.info(perfReport())

  switch (output) {
    case 'json':
      return downloadFile('devup.json', JSON.stringify(devup))
    case 'excel':
      return downloadDevupXlsx('devup.xlsx', JSON.stringify(devup))
  }
}
