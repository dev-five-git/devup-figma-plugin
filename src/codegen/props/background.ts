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
    let backgroundBlend: BlendMode = 'NORMAL'

    for (let i = 0; i < node.fills.length; i++) {
      const fill = node.fills[node.fills.length - 1 - i]
      if (fill.opacity === 0 || !fill.visible) continue
      const cssFill = await paintToCSS(fill, node, i === node.fills.length - 1)
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
        bg: combinedBg,
        bgBlendMode: {
          NORMAL: null,
          MULTIPLY: 'multiply',
          SCREEN: 'screen',
          OVERLAY: 'overlay',
          DARKEN: 'darken',
          LINEAR_BURN: 'linear-burn',
          COLOR_BURN: 'colorBurn',
          LIGHTEN: 'lighten',
          LINEAR_DODGE: 'linear-dodge',
          COLOR_DODGE: 'color-dodge',
          SOFT_LIGHT: 'soft-light',
          HARD_LIGHT: 'hard-light',
          DIFFERENCE: 'difference',
          EXCLUSION: 'exclusion',
          HUE: 'hue',
          SATURATION: 'saturation',
          COLOR: 'color',
          LUMINOSITY: 'luminosity',
          PASS_THROUGH: null,
        }[backgroundBlend],
        color: gradientText ? 'transparent' : undefined,
        bgClip: gradientText ? 'text' : undefined,
      }
    }
  }
}
