import { addPx } from '../../codegen/utils/add-px'
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

/**
 * Map mode name to responsive breakpoint index.
 * mobile=0, sm=1, tablet=2, lg=3, desktop/pc=4.
 * Numeric mode names are used directly.
 * Unknown names default to 0.
 */
function modeNameToBreakpointLevel(name: string): number {
  const lower = name.toLowerCase()
  if (lower === 'mobile') return 0
  if (lower === 'sm') return 1
  if (lower === 'tablet') return 2
  if (lower === 'lg') return 3
  if (lower === 'desktop' || lower === 'pc') return 4
  const num = Number.parseInt(lower, 10)
  if (!Number.isNaN(num) && num >= 0 && num <= 5) return num
  return 0
}

/**
 * Get theme name from colors (first mode name), or "default".
 */
function resolveThemeName(devup: Devup): string {
  const colors = devup.theme?.colors
  if (colors) {
    const firstKey = Object.keys(colors)[0]
    if (firstKey) return firstKey
  }
  return 'default'
}

/**
 * Optimize a responsive array: single value → plain string, trim trailing nulls.
 */
function optimizeResponsiveArray(
  values: (null | string)[],
): string | (null | string)[] {
  const filtered = values.filter((v) => v !== null)
  if (filtered.length === 0) return filtered[0]
  if (filtered.length === 1) return filtered[0]
  // Trim trailing nulls
  while (values.length > 0 && values[values.length - 1] === null) {
    values.pop()
  }
  // If first element is null, shift to start from first non-null
  if (values[0] === null) {
    const arr: (null | string)[] = [filtered[0]]
    for (let i = 1; i < values.length; i++) {
      arr.push(values[i])
    }
    while (arr.length > 0 && arr[arr.length - 1] === null) {
      arr.pop()
    }
    return arr
  }
  return values
}

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
  // Scan ALL variable collections — not just "Devup Colors"
  const allCollections =
    await figma.variables.getLocalVariableCollectionsAsync()
  for (const collection of allCollections) {
    // Pre-fetch all variables once — reuse across modes
    const variables = await Promise.all(
      collection.variableIds.map((varId) =>
        figma.variables.getVariableByIdAsync(varId),
      ),
    )
    // Pre-compute camelCase names once (not per variable per mode)
    const camelNames = variables.map((v) => (v ? toCamel(v.name) : ''))

    // Export COLOR variables
    const hasColors = variables.some(
      (v) => v !== null && v.resolvedType === 'COLOR',
    )
    if (hasColors) {
      devup.theme ??= {}
      devup.theme.colors ??= {}
      const themeColors = devup.theme.colors
      await Promise.all(
        collection.modes.map(async (mode) => {
          const modeName = mode.name.toLowerCase()
          const colors = themeColors[modeName] ?? {}
          themeColors[modeName] = colors
          await Promise.all(
            variables.map(async (variable, i) => {
              if (variable === null || variable.resolvedType !== 'COLOR') return
              const value = variable.valuesByMode[mode.modeId]
              if (typeof value === 'boolean' || typeof value === 'number')
                return
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

    // Export FLOAT variables as length values with responsive arrays
    const hasFloats = variables.some(
      (v) => v !== null && v.resolvedType === 'FLOAT',
    )
    if (hasFloats) {
      devup.theme ??= {}
      devup.theme.length ??= {}

      // Determine theme name from colors, or "default"
      const themeName = resolveThemeName(devup)

      const lengthForTheme = devup.theme.length[themeName] ?? {}
      devup.theme.length[themeName] = lengthForTheme

      // Build responsive arrays from mode values
      for (const variable of variables) {
        if (variable === null || variable.resolvedType !== 'FLOAT') continue
        const name = toCamel(variable.name)
        const values: (null | string)[] = [null, null, null, null, null, null]
        let hasAny = false

        for (const mode of collection.modes) {
          const level = modeNameToBreakpointLevel(mode.name)
          const raw = variable.valuesByMode[mode.modeId]
          let resolved = raw
          if (isVariableAlias(raw)) {
            const aliasResult = await variableAliasToValue(raw, mode.modeId)
            resolved = aliasResult ?? raw
          }
          if (typeof resolved !== 'number') continue
          const px = addPx(resolved)
          if (!px) continue
          values[level] = px
          hasAny = true
        }

        if (hasAny) {
          lengthForTheme[name] = optimizeResponsiveArray(values)
        }
      }

      // Remove empty
      if (Object.keys(lengthForTheme).length === 0) {
        delete devup.theme.length[themeName]
      }
      if (Object.keys(devup.theme.length).length === 0) {
        delete devup.theme.length
      }
    }
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

  // Export effect styles as shadow values with theme wrapper
  const tShadow = perfStart()
  const effectStyles = await figma.getLocalEffectStylesAsync()
  if (effectStyles.length > 0) {
    const shadowByKey: Record<string, (null | string)[]> = {}
    for (const style of effectStyles) {
      const meta = styleNameToTypography(style.name)
      let shadowValues = shadowByKey[meta.name]
      if (!shadowValues) {
        shadowValues = [null, null, null, null, null, null]
        shadowByKey[meta.name] = shadowValues
      }
      if (!shadowValues[meta.level]) {
        shadowValues[meta.level] = effectStyleToCssShadow(style)
      }
    }
    if (Object.keys(shadowByKey).length > 0) {
      devup.theme ??= {}
      devup.theme.shadows ??= {}
      const themeName = resolveThemeName(devup)
      const shadowForTheme: Record<string, string | (null | string)[]> = {}
      devup.theme.shadows[themeName] = shadowForTheme

      for (const [key, values] of Object.entries(shadowByKey)) {
        const optimized = optimizeResponsiveArray(values)
        if (optimized !== undefined) {
          shadowForTheme[key] = optimized
        }
      }
    }
  }
  perfEnd('exportDevup.shadow', tShadow)

  return devup
}

/**
 * Convert a Figma effect style to a CSS shadow string.
 */
function effectStyleToCssShadow(style: EffectStyle): string | null {
  const parts: string[] = []
  for (const effect of style.effects) {
    if (!effect.visible) continue
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      const { offset, radius, color } = effect
      const spread = 'spread' in effect ? (effect.spread ?? 0) : 0
      const prefix = effect.type === 'INNER_SHADOW' ? 'inset ' : ''
      const cssColor = optimizeHex(rgbaToHex(color))
      parts.push(
        `${prefix}${addPx(offset.x, '0')} ${addPx(offset.y, '0')} ${addPx(radius, '0')} ${addPx(spread, '0')} ${cssColor}`,
      )
    }
  }
  return parts.length > 0 ? parts.join(', ') : null
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
