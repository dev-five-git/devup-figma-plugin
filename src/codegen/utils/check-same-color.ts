import { rgbaToHex } from '../../utils/rgba-to-hex'

export function checkSameColor(
  node: SceneNode,
  color: string | null = null,
): null | string {
  let targetColor: string | null = color
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (!fill.visible) continue
      if (fill.type === 'SOLID') {
        if (targetColor === null)
          targetColor = rgbaToHex(figma.util.rgba(fill.color))
        else if (targetColor !== rgbaToHex(figma.util.rgba(fill.color)))
          return null
      } else return null
    }
  }
  if ('children' in node) {
    for (const child of node.children) {
      if (!child.visible) continue
      const res = checkSameColor(child, targetColor)
      if (targetColor === null) targetColor = res
      else if (targetColor !== res) return null
    }
  }

  return targetColor
}
