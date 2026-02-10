import type { NodeContext } from '../types'
import { addPx } from '../utils/add-px'
import { checkAssetNode } from '../utils/check-asset-node'
import { isPageRoot } from '../utils/is-page-root'

export function isFreelayout(node: BaseNode & ChildrenMixin) {
  return (
    (!('inferredAutoLayout' in node) || !node.inferredAutoLayout) &&
    'layoutPositioning' in node &&
    node.layoutPositioning === 'AUTO'
  )
}

export function canBeAbsolute(node: SceneNode): boolean {
  return !!(
    'parent' in node &&
    node.parent &&
    (('layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE') ||
      (isFreelayout(node.parent) &&
        'width' in node.parent &&
        'height' in node.parent &&
        'constraints' in node &&
        !isPageRoot(node as SceneNode)))
  )
}

export function getPositionProps(
  node: SceneNode,
  ctx?: NodeContext,
): Record<string, string | undefined> | undefined {
  if (
    'parent' in node &&
    node.parent &&
    (ctx ? ctx.canBeAbsolute : canBeAbsolute(node))
  ) {
    const constraints =
      'constraints' in node
        ? node.constraints
        : 'children' in node &&
            node.children[0] &&
            'constraints' in node.children[0]
          ? node.children[0].constraints
          : undefined
    if (!constraints) {
      if (isFreelayout(node.parent))
        return {
          pos: 'absolute',
          left: addPx(node.x) ?? '0px',
          top: addPx(node.y) ?? '0px',
        }
      return
    }
    const { horizontal, vertical } = constraints

    let left: string | undefined
    let right: string | undefined
    let top: string | undefined
    let bottom: string | undefined
    let translateX: string | undefined
    let translateY: string | undefined
    switch (horizontal) {
      case 'MIN':
        left = addPx(node.x) ?? '0px'
        break
      case 'MAX':
        right =
          addPx((node.parent as SceneNode).width - node.x - node.width) ?? '0px'
        break
      case 'CENTER':
        left = '50%'
        translateX = '50%'
        break
      default:
        left = '0px'
        right = '0px'
        break
    }
    switch (vertical) {
      case 'MIN':
        top = addPx(node.y) ?? '0px'
        break
      case 'MAX':
        bottom =
          addPx((node.parent as SceneNode).height - node.y - node.height) ??
          '0px'
        break
      case 'CENTER':
        top = '50%'
        translateY = '50%'
        break
      default:
        top = '0px'
        bottom = '0px'
        break
    }
    return {
      pos: 'absolute',
      left,
      right,
      top,
      bottom,
      transform:
        translateX && translateY
          ? `translate(-${translateX}, -${translateY})`
          : translateX
            ? `translateX(-${translateX})`
            : translateY
              ? `translateY(-${translateY})`
              : undefined,
    }
  }
  if (
    'children' in node &&
    (ctx ? ctx.isAsset === null : !checkAssetNode(node)) &&
    (node.children.some(
      (child) =>
        'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE',
    ) ||
      (isFreelayout(node) &&
        node.children.some(
          (child) =>
            'layoutPositioning' in child && child.layoutPositioning === 'AUTO',
        ))) &&
    !(ctx ? ctx.isPageRoot : isPageRoot(node))
  ) {
    return {
      pos: 'relative',
    }
  }
}
