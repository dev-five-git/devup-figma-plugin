import { solidToString } from '../utils/solid-to-string'

export async function getTextStrokeProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if (node.type !== 'TEXT') return

  const strokes = node.strokes.filter((stroke) => stroke.visible)
  if (strokes.length === 0) return
  const solidStrokes = strokes.filter((stroke) => stroke.type === 'SOLID')
  // @todo support gradient stroke
  if (solidStrokes.length === 0) return
  const solidStroke = solidStrokes[0]
  if (typeof node.strokeWeight !== 'number' || node.strokeWeight === 0) return
  return {
    paintOrder: 'stroke fill',
    WebkitTextStroke: `${node.strokeWeight}px ${await solidToString(solidStroke)}`,
  }
}
