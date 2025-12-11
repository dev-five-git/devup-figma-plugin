import { uploadFile } from '../../utils/upload-file'
import type { Devup, DevupTypography } from './types'
import { getDevupColorCollection } from './utils/get-devup-color-collection'
import { uploadDevupXlsx } from './utils/upload-devup-xlsx'

type TargetTypography = [target: string, typography: DevupTypography]
const TYPO_PREFIX = ['mobile', '1', 'tablet', '3', 'desktop', '5'] as const

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

function buildTargetStyleNames(
  style: string,
  value: DevupTypography | (DevupTypography | null)[],
): TargetTypography[] {
  const targets: TargetTypography[] = []
  if (Array.isArray(value)) {
    value.forEach((typo, idx) => {
      if (!typo) return
      const prefix = TYPO_PREFIX[idx] ?? `${idx}`
      targets.push([`${prefix}/${style}`, typo])
    })
    return targets
  }
  targets.push([`mobile/${style}`, value])
  return targets
}

async function applyTypography(
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
