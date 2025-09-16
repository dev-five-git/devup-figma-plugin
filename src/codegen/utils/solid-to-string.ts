import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { toCamel } from '../../utils/to-camel'

export async function solidToString(solid: SolidPaint) {
  if (solid.boundVariables?.color) {
    const variable = await figma.variables.getVariableByIdAsync(
      solid.boundVariables.color.id as string,
    )
    if (variable?.name) return `$${toCamel(variable.name)}`
  }
  return optimizeHex(rgbaToHex(figma.util.rgba(solid.color)))
}
