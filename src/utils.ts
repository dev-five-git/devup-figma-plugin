import { rgbaToHex } from './utils/rgba-to-hex'
import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

export async function propsToPropsWithTypography(
  props: Record<string, unknown>,
  textStyleId: string,
) {
  const ret: Record<string, unknown> = { ...props }
  delete ret.w
  delete ret.h
  const styles = await figma.getLocalTextStylesAsync()
  if (textStyleId && styles.find((style) => style.id === textStyleId)) {
    const style = await figma.getStyleByIdAsync(textStyleId)
    if (style) {
      const split = style.name.split('/')
      ret.typography = toCamel(split[split.length - 1])
      delete ret.fontFamily
      delete ret.fontSize
      delete ret.fontWeight
      delete ret.fontStyle
      delete ret.letterSpacing
      delete ret.lineHeight
    }
  }
  return ret
}

export function space(depth: number) {
  return ' '.repeat(depth * 2)
}

export function getComponentName(node: SceneNode) {
  if (node.type === 'COMPONENT_SET') return toPascal(node.name)
  if (node.type === 'COMPONENT')
    return toPascal(
      node.parent?.type === 'COMPONENT_SET' ? node.parent.name : node.name,
    )
  return toPascal(node.name)
}

export const colorFromFills = async (
  fills:
    | ReadonlyArray<
        Paint & {
          boundVariables?: { color: VariableAlias }
          color?: RGB
        }
      >
    | undefined,
): Promise<string> => {
  const fill = fills?.find((fill) => fill.visible)
  if (fill?.color) {
    if (fill.boundVariables?.color?.id) {
      const variable = await figma.variables.getVariableByIdAsync(
        fill.boundVariables.color.id as string,
      )
      if (variable?.name) return `$${variable.name}`
    }
    if (fill.opacity === 0) return 'transparent'

    return rgbaToHex(
      figma.util.rgba({
        ...fill.color,
        a: fill.opacity,
      }),
    )
  }
  return ''
}
