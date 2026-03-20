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

type TextSearchNode = SceneNode & {
  findAllWithCriteria(criteria: { types: ['TEXT'] }): TextNode[]
}

function isTextSearchNode(node: SceneNode): node is TextSearchNode {
  return 'findAllWithCriteria' in node
}

/**
 * Build the Devup config object from the current Figma file.
 * Extracts colors from Devup variable collection and typography from text styles.
 * When treeshaking is enabled, only typography used in the document is included.
 */
export async function buildDevupConfig(
  treeshaking: boolean = true,
): Promise<Devup> {
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

  const tLoad = perfStart()
  const textStyles = await figma.getLocalTextStylesAsync()
  perfEnd('exportDevup.load', tLoad)

  const typographyByKey: Record<string, (null | DevupTypography)[]> = {}
  const styleMetaById: Record<string, { level: number; name: string }> =
    Object.create(null) as Record<string, { level: number; name: string }>
  let allTypographyKeyCount = 0
  for (const style of textStyles) {
    const meta = styleNameToTypography(style.name)
    let typographyValues = typographyByKey[meta.name]
    if (!typographyValues) {
      typographyValues = [null, null, null, null, null, null]
      typographyByKey[meta.name] = typographyValues
      allTypographyKeyCount += 1
    }
    if (!typographyValues[meta.level]) {
      typographyValues[meta.level] = textStyleToTypography(style)
    }
    styleMetaById[style.id] = meta
  }

  const tTypo = perfStart()
  const typography: Record<string, (null | DevupTypography)[]> = {}
  if (treeshaking) {
    // Skip hidden instance children — can make findAllWithCriteria dramatically faster
    const prevSkip = figma.skipInvisibleInstanceChildren
    figma.skipInvisibleInstanceChildren = true

    const usedTypographyKeys: Record<string, true> = Object.create(
      null,
    ) as Record<string, true>
    let usedTypographyKeyCount = 0
    const markTypographyKeyUsed = (meta?: { level: number; name: string }) => {
      if (!meta || usedTypographyKeys[meta.name]) return false
      usedTypographyKeys[meta.name] = true
      usedTypographyKeyCount += 1
      return true
    }
    const mixedTextStyleId = figma.mixed
    const processText = (text: TextNode) => {
      if (usedTypographyKeyCount >= allTypographyKeyCount) return
      const { textStyleId } = text
      if (typeof textStyleId === 'string' && textStyleId) {
        markTypographyKeyUsed(styleMetaById[textStyleId])
        return
      }
      if (textStyleId !== mixedTextStyleId) return

      for (const seg of text.getStyledTextSegments(['textStyleId'])) {
        if (usedTypographyKeyCount >= allTypographyKeyCount) return
        const segTextStyleId = seg?.textStyleId
        if (!segTextStyleId) continue
        markTypographyKeyUsed(styleMetaById[segTextStyleId])
      }
    }
    const processSubtree = (node: SceneNode) => {
      if (usedTypographyKeyCount >= allTypographyKeyCount) return
      if (node.type === 'TEXT') {
        processText(node)
        return
      }
      if (isTextSearchNode(node)) {
        const tFind = perfStart()
        const texts = node.findAllWithCriteria({ types: ['TEXT'] })
        perfEnd('exportDevup.typography.find', tFind)

        const tScan = perfStart()
        for (const text of texts) {
          processText(text)
          if (usedTypographyKeyCount >= allTypographyKeyCount) break
        }
        perfEnd('exportDevup.typography.scan', tScan)
        return
      }
      if (!('children' in node)) return
      for (const child of node.children) {
        processSubtree(child)
        if (usedTypographyKeyCount >= allTypographyKeyCount) break
      }
    }

    const rootPages = Array.isArray(figma.root.children)
      ? figma.root.children
      : []
    if (rootPages.length > 0) {
      const currentPageId = figma.currentPage.id
      const orderedPages: PageNode[] = [
        figma.currentPage,
        ...rootPages.filter((page) => page.id !== currentPageId),
      ]
      for (const page of orderedPages) {
        if (usedTypographyKeyCount >= allTypographyKeyCount) break
        if (page.id !== currentPageId) {
          const tPageLoad = perfStart()
          await page.loadAsync()
          perfEnd('exportDevup.load', tPageLoad)
        }
        for (const child of page.children) {
          processSubtree(child)
          if (usedTypographyKeyCount >= allTypographyKeyCount) break
        }
      }
    } else {
      const tFind = perfStart()
      const texts = figma.root.findAllWithCriteria({ types: ['TEXT'] })
      perfEnd('exportDevup.typography.find', tFind)

      const tScan = perfStart()
      for (const text of texts) {
        processText(text)
        if (usedTypographyKeyCount >= allTypographyKeyCount) break
      }
      perfEnd('exportDevup.typography.scan', tScan)
    }

    figma.skipInvisibleInstanceChildren = prevSkip

    for (const key of Object.keys(usedTypographyKeys)) {
      typography[key] = [...(typographyByKey[key] ?? [])]
    }
  } else {
    for (const [key, values] of Object.entries(typographyByKey)) {
      typography[key] = [...values]
    }
  }
  perfEnd('exportDevup.typography', tTypo)

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
  perfReset()
  const t = perfStart()
  const devup = await buildDevupConfig(treeshaking)
  perfEnd('exportDevup()', t)
  console.info(perfReport())

  switch (output) {
    case 'json':
      return downloadFile('devup.json', JSON.stringify(devup))
    case 'excel':
      return downloadDevupXlsx('devup.xlsx', JSON.stringify(devup))
  }
}
