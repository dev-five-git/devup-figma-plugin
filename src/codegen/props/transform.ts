import { fmtPct } from '../utils/fmtPct'

export function getTransformProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('rotation' in node && node.rotation !== 0)
    return {
      transform: `rotate(${fmtPct(-node.rotation)}deg)`,
      transformOrigin: 'top left',
    }
}
