import { solidToString } from './solid-to-string'

export async function checkSameColor(
  node: SceneNode,
  color: string | null = null,
): Promise<null | string> {
  let targetColor: string | null = color
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (!fill.visible) continue
      if (fill.type === 'SOLID') {
        if (targetColor === null) targetColor = await solidToString(fill)
        else if (targetColor !== (await solidToString(fill))) return null
      } else return null
    }
  }
  if ('children' in node) {
    for (const child of node.children) {
      if (!child.visible) continue
      const res = await checkSameColor(child, targetColor)
      if (targetColor === null) targetColor = res
      else if (targetColor !== res) return null
    }
  }

  return targetColor
}
