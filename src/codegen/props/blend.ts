import { fmtPct } from '../utils/fmtPct'

export function getBlendProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('opacity' in node) {
    return {
      opacity: node.opacity < 1 ? fmtPct(node.opacity) : undefined,
      mixBlendMode: {
        // same as multiply
        PASS_THROUGH: null,
        NORMAL: null,
        DARKEN: 'darken',
        MULTIPLY: 'multiply',
        LINEAR_BURN: 'linearBurn',
        COLOR_BURN: 'colorBurn',
        LIGHTEN: 'lighten',
        SCREEN: 'screen',
        LINEAR_DODGE: 'linear-dodge',
        COLOR_DODGE: 'color-dodge',
        OVERLAY: 'overlay',
        SOFT_LIGHT: 'soft-light',
        HARD_LIGHT: 'hard-light',
        DIFFERENCE: 'difference',
        EXCLUSION: 'exclusion',
        HUE: 'hue',
        SATURATION: 'saturation',
        COLOR: 'color',
        LUMINOSITY: 'luminosity',
      }[node.blendMode],
    }
  }
}
