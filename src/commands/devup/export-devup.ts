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
    // Pre-compute camelCase names once (not per variable per mode)
    const camelNames = variables.map((v) => (v ? toCamel(v.name) : ''))
    devup.theme ??= {}
    devup.theme.colors ??= {}
    const themeColors = devup.theme.colors
    // Process all modes in parallel
    await Promise.all(
      collection.modes.map(async (mode) => {
        const colors: Record<string, string> = {}
        themeColors[mode.name.toLowerCase()] = colors
        await Promise.all(
          variables.map(async (variable, i) => {
            if (variable === null) return
            const value = variable.valuesByMode[mode.modeId]
            if (typeof value === 'boolean' || typeof value === 'number') return
            if (isVariableAlias(value)) {
              const nextValue = await variableAliasToValue(value, mode.modeId)
              if (nextValue === null) return
              if (
                typeof nextValue === 'boolean' ||
                typeof nextValue === 'number'
              )
                return
              colors[camelNames[i]] = optimizeHex(
                rgbaToHex(figma.util.rgba(nextValue)),
              )
            } else {
              colors[camelNames[i]] = optimizeHex(
                rgbaToHex(figma.util.rgba(value)),
              )
            }
          }),
        )
      }),
    )
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
  const styleMetaById = new Map<string, { level: number; name: string }>()
  const allTypographyKeys = new Set<string>()
  for (const style of textStyles) {
    const meta = styleNameToTypography(style.name)
    stylesById.set(style.id, style)
    styleMetaById.set(style.id, meta)
    allTypographyKeys.add(meta.name)
    styles[style.name] = style
  }

  const tTypo = perfStart()
  const typography: Record<string, (null | DevupTypography)[]> = {}
  if (treeshaking) {
    // Skip hidden instance children — can make findAllWithCriteria dramatically faster
    const prevSkip = figma.skipInvisibleInstanceChildren
    figma.skipInvisibleInstanceChildren = true

    const usedTypographyKeys = new Set<string>()
    const processText = (text: TextNode) => {
      if (usedTypographyKeys.size >= allTypographyKeys.size) return
      if (
        !(typeof text.textStyleId === 'string' && text.textStyleId) &&
        text.textStyleId !== figma.mixed
      )
        return

      if (typeof text.textStyleId === 'string') {
        const style = stylesById.get(text.textStyleId)
        const meta = styleMetaById.get(text.textStyleId)
        if (!style || !meta || usedTypographyKeys.has(meta.name)) return
        usedTypographyKeys.add(meta.name)
        const { level, name } = meta
        if (!typography[name]?.[level]) {
          typography[name] ??= [null, null, null, null, null, null]
          typography[name][level] = textStyleToTypography(style)
        }
        return
      }

      for (const seg of text.getStyledTextSegments(['textStyleId'])) {
        if (usedTypographyKeys.size >= allTypographyKeys.size) return
        if (!seg?.textStyleId) continue
        const style = stylesById.get(seg.textStyleId)
        const meta = styleMetaById.get(seg.textStyleId)
        if (!style || !meta || usedTypographyKeys.has(meta.name)) continue
        usedTypographyKeys.add(meta.name)
        const { level, name } = meta
        if (typography[name]?.[level]) continue
        typography[name] ??= [null, null, null, null, null, null]
        typography[name][level] = textStyleToTypography(style)
      }
    }

    const rootPages = Array.isArray(figma.root.children)
      ? figma.root.children
      : []
    if (rootPages.length > 1) {
      const currentPageId = figma.currentPage.id
      const orderedPages = [
        figma.currentPage,
        ...rootPages.filter((page) => page.id !== currentPageId),
      ]
      for (const page of orderedPages) {
        if (usedTypographyKeys.size >= allTypographyKeys.size) break
        const tFind = perfStart()
        const texts = page.findAllWithCriteria({ types: ['TEXT'] })
        perfEnd('exportDevup.typography.find', tFind)

        const tScan = perfStart()
        for (const text of texts) {
          processText(text)
          if (usedTypographyKeys.size >= allTypographyKeys.size) break
        }
        perfEnd('exportDevup.typography.scan', tScan)
      }
    } else {
      const tFind = perfStart()
      const texts = figma.root.findAllWithCriteria({ types: ['TEXT'] })
      perfEnd('exportDevup.typography.find', tFind)

      const tScan = perfStart()
      for (const text of texts) {
        processText(text)
        if (usedTypographyKeys.size >= allTypographyKeys.size) break
      }
      perfEnd('exportDevup.typography.scan', tScan)
    }

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
