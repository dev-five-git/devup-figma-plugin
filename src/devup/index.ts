import { downloadFile } from '../utils/download-file'
import { isVariableAlias } from '../utils/is-variable-alias'
import { rgbaToHex } from '../utils/rgba-to-hex'
import { styleNameToTypography } from '../utils/style-name-to-typography'
import { textSegmentToTypography } from '../utils/text-segment-to-typography'
import { toCamel } from '../utils/to-camel'
import { variableAliasToValue } from '../utils/variable-alias-to-value'
import { type Devup, DevupTypography } from './types'
import { getDevupColorCollection } from './utils/get-devup-color-collection'

export async function exportDevup() {
  const devup: Devup = {}

  const collection = await getDevupColorCollection()
  if (collection) {
    for (const mode of collection.modes) {
      devup['theme'] ??= {}
      devup['theme']['colors'] ??= {}
      const colors: Record<string, string> = {}
      devup['theme']['colors'][mode.name.toLowerCase()] = colors
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
            colors[toCamel(variable.name)] = rgbaToHex(
              figma.util.rgba(nextValue),
            )
          } else {
            colors[toCamel(variable.name)] = rgbaToHex(figma.util.rgba(value))
          }
        }),
      )
    }
  }

  await figma.loadAllPagesAsync()
  const texts = figma.root.children.flatMap((node) => node.findAll((node) => node.type === 'TEXT')) as TextNode[]
  const textStyles = await figma.getLocalTextStylesAsync()
  const ids = new Set(textStyles.map((style) => style.id))

  const typography: Record<string, (null | DevupTypography)[]> = {}
  await Promise.all(
    texts.map(async (text) => {
      if (typeof text.textStyleId !== 'string') return
      const style = await figma.getStyleByIdAsync(text.textStyleId)
      if (style && ids.has(style.id)) {
        const { type, name } = styleNameToTypography(style.name)
        if (typography[name]) {
          if (type === 'mobile' && typography[name][0]) {
            return
          }
          if (type === 'tablet' && typography[name][2]) {
            return
          }
          if (type === 'desktop' && typography[name][4]) {
            return
          }
        }
        const seg = text.getStyledTextSegments([
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
        ])[0]
        if (seg) {
          const typo = textSegmentToTypography(seg as StyledTextSegment)
          typography[name] ??= [null, null, null, null, null]
          if (type === 'mobile') {
            typography[name][0] = typo
          } else if (type === 'tablet') {
            typography[name][2] = typo
          } else if (type === 'desktop') {
            typography[name][4] = typo
          }
        }
      }
    }),
  )
  if (Object.keys(typography).length > 0) {
    devup['theme'] ??= {}
    devup['theme']['typography'] = Object.entries(typography).reduce(
      (acc, [key, value]) => {
        const filtered = value.filter((v) => v !== null)
        if (filtered.length === 0) return acc
        if (filtered.length === 1) {
          acc[key] = filtered[0]
          return acc
        }
        if (value[0] === null) {
          acc[key] = [filtered[0]]
          let init = false
          for (let i = 0; i < value.length; i += 1) {
            if (value[i] === null) {
              if (init) {
                acc[key].push(null)
              } else {
                if (!init) {
                  acc[key].push(null)
                  init = true
                } else {
                  acc[key].push(value[i])
                }
              }
            }
          }
          return acc
        }
        acc[key] = value
        return acc
      },
      {} as Record<string, DevupTypography | (null | DevupTypography)[]>,
    )
  }

  return downloadFile('devup.json', JSON.stringify(devup))
}
