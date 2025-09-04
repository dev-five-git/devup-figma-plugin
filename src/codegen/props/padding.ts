import { optimizeSpace } from '../utils/optimize-space'

export function getPaddingProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if ('paddingLeft' in node) {
    return optimizeSpace(
      'p',
      node.paddingTop,
      node.paddingRight,
      node.paddingBottom,
      node.paddingLeft,
    )
  }
}
