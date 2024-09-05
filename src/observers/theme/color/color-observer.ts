import {
  DATA_DEVUP_COLORS_VALUE,
  DATA_DEVUP_COLORS_VAR,
  DATA_DEVUP_COLORS_VAR_MODE,
  DATA_DEVUP_COLORS_VAR_MODE_ID,
  DATA_DEVUP_DARK_COLORS_VALUE,
} from '../../../constants/Theme'
import { hasData } from '../../../utils/hasData'
import { rgbToColor } from '../../../utils/rgbToColor'

export async function colorObserver(id: string) {
  const node = (await figma.getNodeByIdAsync(id)) as RectangleNode | null

  console.log('니니', node?.getPluginDataKeys())
  if (
    !node ||
    !hasData(node, DATA_DEVUP_COLORS_VAR) ||
    !hasData(node, DATA_DEVUP_COLORS_VAR_MODE)
  )
    return
  const variable = await figma.variables.getVariableByIdAsync(
    node.getPluginData(DATA_DEVUP_COLORS_VAR),
  )
  if (!node.fills) return
  const paint = (node.fills as Paint[])[0]
  if (paint.type !== 'SOLID') return
  const frame = node.parent as FrameNode

  console.log(
    '너니',
    node.getPluginData(DATA_DEVUP_COLORS_VAR_MODE),
    node.getPluginData(DATA_DEVUP_COLORS_VAR_MODE) === 'LIGHT',
  )
  frame.setPluginData(
    node.getPluginData(DATA_DEVUP_COLORS_VAR_MODE) === 'LIGHT'
      ? DATA_DEVUP_COLORS_VALUE
      : DATA_DEVUP_DARK_COLORS_VALUE,
    rgbToColor(paint.color),
  )
  variable?.setValueForMode(
    node.getPluginData(DATA_DEVUP_COLORS_VAR_MODE_ID),
    paint.color,
  )
}
