import { solidToString, solidToStringSync } from '../utils/solid-to-string'

export async function getTextStrokeProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if (node.type !== 'TEXT') return

  const strokes = node.strokes.filter((stroke) => stroke.visible !== false)
  if (strokes.length === 0) return
  const solidStrokes = strokes.filter((stroke) => stroke.type === 'SOLID')
  // @todo support gradient stroke
  if (solidStrokes.length === 0) return
  const solidStroke = solidStrokes[0]
  if (typeof node.strokeWeight !== 'number' || node.strokeWeight === 0) return
  const color =
    solidToStringSync(solidStroke) ?? (await solidToString(solidStroke))
  return {
    paintOrder: 'stroke fill',
    WebkitTextStroke: `${node.strokeWeight}px ${color}`,
  }
}
