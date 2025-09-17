import { fmtPct } from '../utils/fmtPct'

export function getOpacityProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('opacity' in node && node.opacity < 1) {
    return {
      opacity: fmtPct(node.opacity),
    }
  }
}
