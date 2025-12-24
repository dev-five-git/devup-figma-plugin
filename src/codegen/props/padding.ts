import { optimizeSpace } from '../utils/optimize-space'

export function getPaddingProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (
    'inferredAutoLayout' in node &&
    node.inferredAutoLayout &&
    'paddingLeft' in node.inferredAutoLayout
  ) {
    return optimizeSpace(
      'p',
      node.inferredAutoLayout.paddingTop,
      node.inferredAutoLayout.paddingRight,
      node.inferredAutoLayout.paddingBottom,
      node.inferredAutoLayout.paddingLeft,
    )
  }
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
