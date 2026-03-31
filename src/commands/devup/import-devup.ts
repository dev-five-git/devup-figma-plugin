import { uploadFile } from '../../utils/upload-file'
import { applyTypography } from './apply-typography'
import { buildTargetStyleNames } from './build-target-style-names'
import type { Devup } from './types'
import { getDevupColorCollection } from './utils/get-devup-color-collection'
import { uploadDevupXlsx } from './utils/upload-devup-xlsx'

export async function importDevup(input: 'json' | 'excel') {
  const devup = await loadDevup(input)
  await importColors(devup)
  await importLength(devup)
  await importTypography(devup)
  await importShadow(devup)
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
  const variables = await figma.variables.getLocalVariablesAsync()
  const collectionVariableIds = new Set(collection.variableIds)
  const variablesByName = new Map<string, Variable>()
  for (const variable of variables) {
    if (
      collectionVariableIds.has(variable.id) &&
      !variablesByName.has(variable.name)
    ) {
      variablesByName.set(variable.name, variable)
    }
  }
  const modeIdsByName = new Map(
    collection.modes.map((mode) => [mode.name, mode.modeId] as const),
  )

  const themes = new Set<string>()
  const colorNames = new Set<string>()

  for (const [theme, value] of Object.entries(colors)) {
    let modeId = modeIdsByName.get(theme)
    if (!modeId) {
      modeId = collection.addMode(theme)
      modeIdsByName.set(theme, modeId)
    }

    for (const [colorKey, colorValue] of Object.entries(value)) {
      let variable = variablesByName.get(colorKey)
      if (!variable) {
        variable = figma.variables.createVariable(colorKey, collection, 'COLOR')
        variablesByName.set(colorKey, variable)
        variables.push(variable)
        collectionVariableIds.add(variable.id)
      }

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

  for (const variable of variables) {
    if (
      !collectionVariableIds.has(variable.id) ||
      colorNames.has(variable.name)
    ) {
      continue
    }
    variable.remove()
  }
}

const RESPONSIVE_MODE_NAMES = [
  'mobile',
  '1',
  'tablet',
  '3',
  'desktop',
  '5',
] as const

async function importLength(devup: Devup) {
  const length = devup.theme?.length
  if (!length) return

  const collection =
    (await getDevupColorCollection()) ??
    (await figma.variables.createVariableCollection('Devup Colors'))
  const variables = await figma.variables.getLocalVariablesAsync()
  const collectionVariableIds = new Set(collection.variableIds)
  const variablesByName = new Map<string, Variable>()
  for (const variable of variables) {
    if (
      collectionVariableIds.has(variable.id) &&
      variable.resolvedType === 'FLOAT' &&
      !variablesByName.has(variable.name)
    ) {
      variablesByName.set(variable.name, variable)
    }
  }
  const modeIdsByName = new Map(
    collection.modes.map((mode) => [mode.name, mode.modeId] as const),
  )

  // Format: length[theme][varName] = string | (string | null)[]
  for (const themeValues of Object.values(length)) {
    for (const [varName, value] of Object.entries(themeValues)) {
      let variable = variablesByName.get(varName)
      if (!variable) {
        variable = figma.variables.createVariable(varName, collection, 'FLOAT')
        variablesByName.set(varName, variable)
      }

      if (typeof value === 'string') {
        // Single value → set for first mode (mobile)
        const modeName = RESPONSIVE_MODE_NAMES[0]
        let modeId = modeIdsByName.get(modeName)
        if (!modeId) {
          modeId = collection.addMode(modeName)
          modeIdsByName.set(modeName, modeId)
        }
        variable.setValueForMode(modeId, Number.parseFloat(value))
      } else if (Array.isArray(value)) {
        // Responsive array → set per breakpoint mode
        for (let i = 0; i < value.length; i++) {
          const v = value[i]
          if (!v) continue
          const modeName = RESPONSIVE_MODE_NAMES[i] ?? `${i}`
          let modeId = modeIdsByName.get(modeName)
          if (!modeId) {
            modeId = collection.addMode(modeName)
            modeIdsByName.set(modeName, modeId)
          }
          variable.setValueForMode(modeId, Number.parseFloat(v))
        }
      }
    }
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

const SHADOW_PREFIX = ['mobile', '1', 'tablet', '3', 'desktop', '5'] as const

async function importShadow(devup: Devup) {
  const shadow = devup.theme?.shadow
  if (!shadow) return

  const styles = await figma.getLocalEffectStylesAsync()

  // Format: shadow[theme][styleName] = string | (string | null)[]
  for (const themeValues of Object.values(shadow)) {
    for (const [name, value] of Object.entries(themeValues)) {
      if (typeof value === 'string') {
        await applyShadow(`mobile/${name}`, value, styles)
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const v = value[i]
          if (!v) continue
          const prefix = SHADOW_PREFIX[i] ?? `${i}`
          await applyShadow(`${prefix}/${name}`, v, styles)
        }
      }
    }
  }
}

async function applyShadow(
  target: string,
  cssShadow: string,
  styles: EffectStyle[],
) {
  const effects = parseCssShadow(cssShadow)
  if (effects.length === 0) return

  const st = styles.find((s) => s.name === target) ?? figma.createEffectStyle()
  st.name = target
  st.effects = effects
}

/**
 * Parse a CSS box-shadow string into Figma Effect objects.
 * Supports: [inset] <offsetX> <offsetY> <blurRadius> <spreadRadius> <color>
 */
function parseCssShadow(css: string): Effect[] {
  // Split multiple shadows by comma (but not commas inside rgba/hsla)
  const shadowParts = splitCssShadows(css)
  const effects: Effect[] = []

  for (const part of shadowParts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const isInset = trimmed.startsWith('inset ')
    const values = isInset ? trimmed.slice(6).trim() : trimmed

    // Extract color (last token or rgba/hsla function)
    const { lengths, color } = extractShadowParts(values)
    if (lengths.length < 2) continue

    const offsetX = parsePxValue(lengths[0])
    const offsetY = parsePxValue(lengths[1])
    const blurRadius = lengths.length > 2 ? parsePxValue(lengths[2]) : 0
    const spreadRadius = lengths.length > 3 ? parsePxValue(lengths[3]) : 0

    effects.push({
      type: isInset ? 'INNER_SHADOW' : 'DROP_SHADOW',
      visible: true,
      blendMode: 'NORMAL',
      color: parseColor(color),
      offset: { x: offsetX, y: offsetY },
      radius: blurRadius,
      spread: spreadRadius,
      showShadowBehindNode: false,
    } as DropShadowEffect)
  }

  return effects
}

function splitCssShadows(css: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of css) {
    if (char === '(') depth++
    else if (char === ')') depth--
    else if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) parts.push(current)
  return parts
}

function extractShadowParts(values: string): {
  lengths: string[]
  color: string
} {
  // Match rgba/hsla functions or hex colors
  const colorMatch = values.match(
    /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})\s*$/,
  )
  if (colorMatch) {
    const colorStr = colorMatch[1]
    const lengthStr = values.slice(0, values.length - colorMatch[0].length)
    return {
      lengths: lengthStr.trim().split(/\s+/),
      color: colorStr,
    }
  }
  // Fallback: assume last token is color
  const tokens = values.trim().split(/\s+/)
  return {
    lengths: tokens.slice(0, -1),
    color: tokens[tokens.length - 1] || '#000',
  }
}

function parsePxValue(value: string): number {
  if (value === '0') return 0
  return Number.parseFloat(value) || 0
}

function parseColor(color: string): RGBA {
  // Handle hex
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length <= 4) {
      // Short hex: #RGB or #RGBA
      const r = Number.parseInt(hex[0] + hex[0], 16) / 255
      const g = Number.parseInt(hex[1] + hex[1], 16) / 255
      const b = Number.parseInt(hex[2] + hex[2], 16) / 255
      const a =
        hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1
      return { r, g, b, a }
    }
    const r = Number.parseInt(hex.slice(0, 2), 16) / 255
    const g = Number.parseInt(hex.slice(2, 4), 16) / 255
    const b = Number.parseInt(hex.slice(4, 6), 16) / 255
    const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
    return { r, g, b, a }
  }
  // Handle rgba(r, g, b, a)
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/,
  )
  if (rgbaMatch) {
    return {
      r: Number.parseInt(rgbaMatch[1], 10) / 255,
      g: Number.parseInt(rgbaMatch[2], 10) / 255,
      b: Number.parseInt(rgbaMatch[3], 10) / 255,
      a: rgbaMatch[4] ? Number.parseFloat(rgbaMatch[4]) : 1,
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 }
}
