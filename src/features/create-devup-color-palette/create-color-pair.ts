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
  frame.appendChild(
    await addLabel(
      name + ` - Light (${color})`,
      await createColorPoint(name, color),
    ),
  )

  const darkColor = rgbToColor(variable.valuesByMode[darkColorId] as RGB)
  frame.appendChild(
    await addLabel(
      name + ` - Dark (${darkColor})`,
      await createColorPoint(name, darkColor),
    ),
  )

  return frame
}
