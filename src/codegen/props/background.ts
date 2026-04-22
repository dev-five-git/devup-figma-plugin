import { BLEND_MODE_MAP } from '../utils/blend-mode-map'
import { paintToCSS, paintToCSSSyncIfPossible } from '../utils/paint-to-css'

export async function getBackgroundProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if ('fills' in node && node.fills !== figma.mixed) {
    const fills = node.fills
    const gradientText =
      node.type === 'TEXT' &&
      !!fills.find(
        (fill) =>
          fill.visible &&
          (fill.type === 'IMAGE' || fill.type.includes('GRADIENT')),
      )

    const visibleFills = [...fills]
      .reverse()
      .filter((fill) => fill.opacity !== 0 && fill.visible)
      .map((fill, i, reversedVisibleFills) => ({
        fill,
        isLast: i === reversedVisibleFills.length - 1,
      }))

    const cssFills: string[] = []
    let backgroundBlend: BlendMode = 'NORMAL'

    const cssFillResults = await Promise.all(
      visibleFills.map(async ({ fill, isLast }) => {
        const cssFill =
          paintToCSSSyncIfPossible(fill, node, isLast) ??
          (await paintToCSS(fill, node, isLast))
        return { fill, cssFill }
      }),
    )

    for (const { fill, cssFill } of cssFillResults) {
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
        WebkitTextFillColor: gradientText ? 'transparent' : undefined,
        bgClip: gradientText ? 'text' : undefined,
      }
    }
  }
}
