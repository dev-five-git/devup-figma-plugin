/**
 * Figma BlendMode to CSS blend-mode mapping
 */
export const BLEND_MODE_MAP: Record<string, string | null> = {
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
}
