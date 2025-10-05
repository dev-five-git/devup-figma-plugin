import { paintToCSS } from '../utils/paint-to-css'

export async function getBackgroundProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if ('fills' in node && node.fills !== figma.mixed) {
    const gradientText =
      node.type === 'TEXT' &&
      node.fills.find(
        (fill) =>
          fill.visible &&
          (fill.type === 'IMAGE' || fill.type.includes('GRADIENT')),
      )

    const cssFills: string[] = []

    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[i]
      if (fill.opacity === 0 || !fill.visible) continue
      const cssFill = await paintToCSS(fill, node)
      if (cssFill) {
        cssFills.push(cssFill)
      }
    }

    if (cssFills.length > 0) {
      const combinedBg = cssFills.join(', ')

      return {
        bg: combinedBg,
        color: gradientText ? 'transparent' : undefined,
        bgClip: gradientText ? 'text' : undefined,
      }
    }
  }
}
