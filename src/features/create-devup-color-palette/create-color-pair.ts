import {
  DATA_DEVUP_COLORS_VAR,
  DATA_DEVUP_COLORS_VAR_MODE,
  DATA_DEVUP_COLORS_VAR_MODE_ID,
} from '../../constants/Theme'
import { addLabel } from '../../utils/addLabel'
import { rgbToColor } from '../../utils/rgbToColor'
import { createColorPoint } from './create-color-point'

export async function createColorPair(
  name: string,
  variable: Variable,
  colorId: string,
  darkColorId: string,
) {
  const frame = figma.createFrame()
  // flex mode
  frame.layoutMode = 'HORIZONTAL'

  // auto layout top right
  frame.primaryAxisAlignItems = 'SPACE_BETWEEN'
  frame.counterAxisAlignItems = 'CENTER'
  // auto layout direction
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'AUTO'

  frame.itemSpacing = 4
  frame.name = name

  const color = rgbToColor(variable.valuesByMode[colorId] as RGB)
  frame.appendChild(
    await addLabel(name, await createColorPoint(name, variable)),
  )
  const lightColorPoint = await createColorPoint(name, color)
  lightColorPoint.setPluginData(DATA_DEVUP_COLORS_VAR_MODE_ID, colorId)
  lightColorPoint.setPluginData(DATA_DEVUP_COLORS_VAR_MODE, 'LIGHT')
  lightColorPoint.setPluginData(DATA_DEVUP_COLORS_VAR, variable.id)
  frame.appendChild(
    await addLabel(name + ` - Light (${color})`, lightColorPoint),
  )

  const darkColor = rgbToColor(variable.valuesByMode[darkColorId] as RGB)
  const darkColorPoint = await createColorPoint(name, darkColor)
  darkColorPoint.setPluginData(DATA_DEVUP_COLORS_VAR_MODE_ID, darkColorId)
  darkColorPoint.setPluginData(DATA_DEVUP_COLORS_VAR_MODE, 'DARK')
  darkColorPoint.setPluginData(DATA_DEVUP_COLORS_VAR, variable.id)
  frame.appendChild(
    await addLabel(name + ` - Dark (${darkColor})`, darkColorPoint),
  )

  return frame
}
