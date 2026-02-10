import { BLEND_MODE_MAP } from '../utils/blend-mode-map'
import { paintToCSS, paintToCSSSyncIfPossible } from '../utils/paint-to-css'

export async function getBackgroundProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if ('fills' in node && node.fills !== figma.mixed) {
    const gradientText =
      node.type === 'TEXT' &&
      !!node.fills.find(
        (fill) =>
          fill.visible &&
          (fill.type === 'IMAGE' || fill.type.includes('GRADIENT')),
      )

    const cssFills: string[] = []
    let backgroundBlend: BlendMode = 'NORMAL'

    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[node.fills.length - 1 - i]
      if (fill.opacity === 0 || !fill.visible) continue
      const cssFill =
        paintToCSSSyncIfPossible(fill, node, i === node.fills.length - 1) ??
        (await paintToCSS(fill, node, i === node.fills.length - 1))
      if (
        fill.type === 'SOLID' &&
        fill.blendMode &&
        fill.blendMode !== 'NORMAL'
      ) {
        backgroundBlend = fill.blendMode
      }
      if (cssFill) {
        cssFills.push(cssFill)
      }
    }

    if (cssFills.length > 0) {
      const combinedBg = cssFills.join(', ')
      return {
        bg: node.type !== 'TEXT' || gradientText ? combinedBg : null,
        bgBlendMode: BLEND_MODE_MAP[backgroundBlend],
        color: gradientText ? 'transparent' : undefined,
        bgClip: gradientText ? 'text' : undefined,
      }
    }
  }
}
