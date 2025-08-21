
import { type Devup, DevupTypography } from './types'
import { getDevupColorCollection } from './utils/get-devup-color-collection'
import { downloadFile } from '../../utils/download-file'
import { isVariableAlias } from '../../utils/is-variable-alias'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { styleNameToTypography } from '../../utils/style-name-to-typography'
import { textSegmentToTypography } from '../../utils/text-segment-to-typography'
import { toCamel } from '../../utils/to-camel'
import { uploadFile } from '../../utils/upload-file'
import { variableAliasToValue } from '../../utils/variable-alias-to-value'
import { optimizeHex } from '../../utils/optimize-hex'

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
            colors[toCamel(variable.name)] = optimizeHex(rgbaToHex(
              figma.util.rgba(nextValue),
            ))
          } else {
            colors[toCamel(variable.name)] = optimizeHex(rgbaToHex(figma.util.rgba(value)))
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
    texts
    .filter((text) => typeof text.textStyleId === 'string')
    .map(async (text) => {
      const style = await figma.getStyleByIdAsync(text.textStyleId as string)
      if (!(style && ids.has(style.id))) return
        const { level , name } = styleNameToTypography(style.name)
        if (typography[name]&&typography[name][level]) return
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
          if (seg) {
            const typo = textSegmentToTypography(seg as StyledTextSegment)
            typography[name] ??= [null, null, null, null, null, null]
            typography[name][level] = typo
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

export async function importDevup() {
  const devup: Devup = JSON.parse(await uploadFile('.json'))
  if (devup.theme?.colors) {
    const collection = (await getDevupColorCollection()) ?? (await figma.variables.createVariableCollection('Devup Colors'))
    const themes = new Set()
    const colors = new Set()
    for (const [theme, value] of Object.entries(devup.theme.colors)) {
      const modeId = collection.modes.find((mode) => mode.name === theme)?.modeId ?? collection.addMode(theme)

      const variables = await figma.variables.getLocalVariablesAsync()
      for (const [colorKey, colorValue] of Object.entries(value)) {
        const variable = variables.find((variable) => variable.name === colorKey) ?? figma.variables.createVariable(colorKey, collection, 'COLOR')

        variable.setValueForMode(modeId, figma.util.rgba(colorValue))
        colors.add(colorKey)
      }
      themes.add(theme)
    }
    for(const theme of collection.modes.filter((mode) => !themes.has(mode.name))) 
      collection.removeMode(theme.modeId)

    const variables = await figma.variables.getLocalVariablesAsync()
    for(const variable of variables.filter((variable) => !colors.has(variable.name)))
      variable.remove()
  }
  if (devup.theme?.typography) {
    const styles = await figma.getLocalTextStylesAsync()
    for(const [style, value] of Object.entries(devup.theme.typography)) {
      const targetStyleNames:[target:string, typography:DevupTypography][] = []
      if (Array.isArray(value)) {
        for(const v in value) {
          if(v&&value[v]) {

            targetStyleNames.push([`${{
              0: 'mobile',
              2: 'tablet',
              4: 'desktop',
            }[v]}/${style}`, value[v]])
          }
        }
      } else {
        targetStyleNames.push([`mobile/${style}`, value])
      }

      for(const [target, typography] of targetStyleNames) {
        const st = styles.find((s) => s.name === target) ?? figma.createTextStyle()
        st.name = target

        if(typography.fontWeight || typography.fontStyle) {
          const fontFamily = {
            family: typography.fontFamily ?? "Inter",
            style: typography.fontStyle == 'italic' ? 'Italic' : 'Regular',
          }
          await figma.loadFontAsync(fontFamily)
          st.fontName = fontFamily
        }
        if(typography.fontSize) {
          st.fontSize = parseInt(typography.fontSize)
        }
        if(typography.letterSpacing) {
          if(typography.letterSpacing.endsWith('em')) {

            st.letterSpacing = {
              unit: 'PERCENT',
              value: parseFloat(typography.letterSpacing),
            }
          } else {
            st.letterSpacing = {
              unit: 'PIXELS',
              value: parseFloat(typography.letterSpacing) * 100,
            }
          }
        }
        if(typography.lineHeight) {
          if(typography.lineHeight === 'normal') {
            st.lineHeight = {
              unit: 'AUTO',
            }
          } else {
            if(typeof typography.lineHeight === 'string') {
              st.lineHeight = {
                unit: 'PIXELS',
                value: parseInt(typography.lineHeight),
              }
            } else {
              st.lineHeight = {
                unit: 'PERCENT',
                value: Math.round(typography.lineHeight / 10) / 10,
              }
            }
          }
        }
        if(typography.textTransform) {
          st.textCase = typography.textTransform.toUpperCase() as TextCase
        }
        if(typography.textDecoration) {
          st.textDecoration = typography.textDecoration.toUpperCase() as TextDecoration
        }
      }
    }
  }
}
