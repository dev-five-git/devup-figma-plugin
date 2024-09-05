import { DEVUP_COLORS, DEVUP_DARK_COLORS } from '../../constants/Devup'
import {
  DATA_DEVUP_COLORS_KEY,
  DATA_DEVUP_COLORS_VALUE,
  DATA_DEVUP_DARK_COLORS_VALUE,
  FRAME_DEVUP_COLOR_PALETTE,
  PAGE_DEVUP_DESIGN_SYSTEM,
} from '../../constants/Theme'
import { colorToRgb } from '../../utils/colorToRgb'
import { hasData } from '../../utils/hasData'
import { createDevupVariables } from '../../variables/create-devup-variables'
import { createColorPair } from './create-color-pair'

export async function createDevupColorPalette() {
  await figma.loadAllPagesAsync()
  let page: PageNode | undefined = figma.root.findAll(
    (node) => node.type === 'PAGE' && node.name === PAGE_DEVUP_DESIGN_SYSTEM,
  )[0] as PageNode | undefined
  if (!page) {
    page = figma.createPage()
    page.name = PAGE_DEVUP_DESIGN_SYSTEM
  }

  await figma.setCurrentPageAsync(page as PageNode)
  let palette = page.findChild(
    (node) => node.type === 'FRAME' && node.name === FRAME_DEVUP_COLOR_PALETTE,
  ) as FrameNode | undefined

  const obj: Record<string, [string | null, string | null]> = {}
  if (palette) {
    for (const value of palette.children) {
      const keys = value.getPluginDataKeys()
      if (
        !keys.includes(DATA_DEVUP_COLORS_KEY) ||
        (!keys.includes(DATA_DEVUP_COLORS_VALUE) &&
          !keys.includes(DATA_DEVUP_DARK_COLORS_VALUE))
      ) {
        value.remove()
        continue
      }

      const _key = await value.getPluginData('DEVUP_COLORS_KEY')
      if (hasData(value, DATA_DEVUP_DARK_COLORS_VALUE)) {
        const darkValue = await value.getPluginData(
          DATA_DEVUP_DARK_COLORS_VALUE,
        )
        obj[_key] = [null, darkValue]
      }
      if (hasData(value, DATA_DEVUP_COLORS_VALUE)) {
        const lightValue = await value.getPluginData(DATA_DEVUP_COLORS_VALUE)
        obj[_key] = [lightValue, obj[_key]?.[1]]
      }
      value.remove()
    }
  } else {
    palette = figma.createFrame()
    page.appendChild(palette)
    palette.name = 'Devup Color Palette'
    palette.layoutMode = 'VERTICAL'
    // auto layout top right
    palette.primaryAxisAlignItems = 'CENTER'
    // auto layout direction
    palette.primaryAxisSizingMode = 'AUTO'
    palette.counterAxisSizingMode = 'AUTO'
    palette.itemSpacing = 4
    palette.horizontalPadding = 8
    palette.verticalPadding = 8
  }

  const { collection, darkModeId, lightModeId } = await createDevupVariables()

  for (const [key, defaultColor] of Object.entries(DEVUP_COLORS)) {
    const [lightColor, darkColor] = obj[key] ?? [null, null]
    const resLight = lightColor || defaultColor
    const resDark: string | null =
      darkColor || DEVUP_DARK_COLORS[key as keyof typeof DEVUP_DARK_COLORS]

    const variable = figma.variables.createVariable(key, collection, 'COLOR')
    variable.setValueForMode(lightModeId, colorToRgb(resLight))
    variable.setValueForMode(darkModeId, colorToRgb(resDark || resLight))
    const fr = await createColorPair(key, variable, lightModeId, darkModeId)
    fr.setPluginData(DATA_DEVUP_COLORS_KEY, key)
    fr.setPluginData(DATA_DEVUP_COLORS_VALUE, resLight)
    if (resDark) fr.setPluginData(DATA_DEVUP_DARK_COLORS_VALUE, resDark)
    palette.appendChild(fr)
  }
  for (const [key, color] of Object.entries(obj)) {
    if (obj[key]) continue
    const variable = figma.variables.createVariable(key, collection, 'COLOR')
    if (color[0]) variable.setValueForMode(lightModeId, colorToRgb(color[0]))
    if (color[1])
      variable.setValueForMode(darkModeId, colorToRgb(color[1] || color[0]!))
    const fr = await createColorPair(key, variable, lightModeId, darkModeId)
    fr.setPluginData(DATA_DEVUP_COLORS_KEY, key)
    if (color[0]) fr.setPluginData(DATA_DEVUP_COLORS_VALUE, color[0])
    if (color[1]) fr.setPluginData(DATA_DEVUP_DARK_COLORS_VALUE, color[1])
    palette.appendChild(fr)
  }
  const half = (palette.width + 100) / 3
  palette.children.forEach((child) => {
    if ((child as FrameNode).layoutSizingHorizontal) {
      ;(child as FrameNode).layoutSizingHorizontal = 'FILL'
      ;(child as FrameNode).children.forEach((child) => {
        ;(child as FrameNode).resize(half - 4, (child as FrameNode).height)
      })
    }
  })
}
