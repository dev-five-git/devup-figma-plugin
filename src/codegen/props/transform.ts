import { fmtPct } from '../utils/fmtPct'
import { canBeAbsolute } from './position'

export function getTransformProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('rotation' in node && Math.abs(node.rotation) > 0.01)
    return {
      transform: `rotate(${fmtPct(-node.rotation)}deg)`,
      transformOrigin: canBeAbsolute(node) ? 'top left' : undefined,
    }
}
