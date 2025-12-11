import { uploadFile } from '../../utils/upload-file'
import { applyTypography } from './apply-typography'
import { buildTargetStyleNames } from './build-target-style-names'
import type { Devup } from './types'
import { getDevupColorCollection } from './utils/get-devup-color-collection'
import { uploadDevupXlsx } from './utils/upload-devup-xlsx'

export async function importDevup(input: 'json' | 'excel') {
  const devup = await loadDevup(input)
  await importColors(devup)
  await importTypography(devup)
}

async function loadDevup(input: 'json' | 'excel'): Promise<Devup> {
  return input === 'json'
    ? JSON.parse(await uploadFile('.json'))
    : await uploadDevupXlsx()
}

async function importColors(devup: Devup) {
  const colors = devup.theme?.colors
  if (!colors) return

  const collection =
    (await getDevupColorCollection()) ??
    (await figma.variables.createVariableCollection('Devup Colors'))

  const themes = new Set<string>()
  const colorNames = new Set<string>()

  for (const [theme, value] of Object.entries(colors)) {
    const modeId =
      collection.modes.find((mode) => mode.name === theme)?.modeId ??
      collection.addMode(theme)

    const variables = await figma.variables.getLocalVariablesAsync()
    for (const [colorKey, colorValue] of Object.entries(value)) {
      const variable =
        variables.find((variable) => variable.name === colorKey) ??
        figma.variables.createVariable(colorKey, collection, 'COLOR')

      variable.setValueForMode(modeId, figma.util.rgba(colorValue))
      colorNames.add(colorKey)
    }
    themes.add(theme)
  }

  for (const theme of collection.modes.filter(
    (mode) => !themes.has(mode.name),
  )) {
    collection.removeMode(theme.modeId)
  }

  const variables = await figma.variables.getLocalVariablesAsync()
  for (const variable of variables.filter((v) => !colorNames.has(v.name))) {
    variable.remove()
  }
}

async function importTypography(devup: Devup) {
  const typography = devup.theme?.typography
  if (!typography) return

  const styles = await figma.getLocalTextStylesAsync()

  for (const [style, value] of Object.entries(typography)) {
    const targetStyleNames = buildTargetStyleNames(style, value)
    for (const [target, typo] of targetStyleNames) {
      await applyTypography(target, typo, styles)
    }
  }
}
