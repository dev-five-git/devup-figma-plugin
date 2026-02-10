import type { NodeContext } from '../types'
import { fmtPct } from '../utils/fmtPct'
import { canBeAbsolute } from './position'

export function getTransformProps(
  node: SceneNode,
  ctx?: NodeContext,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('rotation' in node && Math.abs(node.rotation) > 0.01)
    return {
      transform: `rotate(${fmtPct(-node.rotation)}deg)`,
      transformOrigin: (ctx ? ctx.canBeAbsolute : canBeAbsolute(node))
        ? 'top left'
        : undefined,
    }
}
