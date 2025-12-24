import { BLEND_MODE_MAP } from '../utils/blend-mode-map'
import { fmtPct } from '../utils/fmtPct'

export function getBlendProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('opacity' in node) {
    return {
      opacity: node.opacity < 1 ? fmtPct(node.opacity) : undefined,
      mixBlendMode: BLEND_MODE_MAP[node.blendMode],
    }
  }
}
