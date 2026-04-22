import type { NodeContext } from '../types'
import { optimizeSpaceAsync } from '../utils/optimize-space'

export async function getPaddingProps(
  node: SceneNode,
  ctx?: NodeContext,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  const bv =
    ctx?.boundVariables ??
    ('boundVariables' in node
      ? (node.boundVariables as
          | Record<string, { id: string } | undefined>
          | undefined)
      : undefined)

  if (
    'inferredAutoLayout' in node &&
    node.inferredAutoLayout &&
    'paddingLeft' in node.inferredAutoLayout
  ) {
    return optimizeSpaceAsync(
      'p',
      node.inferredAutoLayout.paddingTop,
      node.inferredAutoLayout.paddingRight,
      node.inferredAutoLayout.paddingBottom,
      node.inferredAutoLayout.paddingLeft,
      bv,
    )
  }
  if ('paddingLeft' in node) {
    return optimizeSpaceAsync(
      'p',
      node.paddingTop,
      node.paddingRight,
      node.paddingBottom,
      node.paddingLeft,
      bv,
    )
  }
}
