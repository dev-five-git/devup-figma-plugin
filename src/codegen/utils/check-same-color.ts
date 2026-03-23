import { solidToString, solidToStringSync } from './solid-to-string'

export async function checkSameColor(
  node: SceneNode,
  color: string | null = null,
): Promise<null | string | false> {
  let targetColor: string | null = color

  // Check both fills and strokes for solid colors
  const paintArrays: Paint[][] = []
  if ('fills' in node && Array.isArray(node.fills)) paintArrays.push(node.fills)
  if ('strokes' in node && Array.isArray(node.strokes))
    paintArrays.push(node.strokes)

  for (const paints of paintArrays) {
    for (const paint of paints) {
      if (!paint.visible) continue
      if (paint.type === 'SOLID') {
        const syncColor = solidToStringSync(paint)
        if (syncColor !== null) {
          if (targetColor === null) targetColor = syncColor
          else if (targetColor !== syncColor) return false
        } else {
          if (targetColor === null) targetColor = await solidToString(paint)
          else if (targetColor !== (await solidToString(paint))) return false
        }
      } else return null
    }
  }

  if ('children' in node) {
    for (const child of node.children) {
      if (!child.visible) continue
      const res = await checkSameColor(child, targetColor)
      if (res === false) return false
      if (targetColor === null) targetColor = res
      else if (targetColor !== res) return false
    }
  }

  return targetColor
}
