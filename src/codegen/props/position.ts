import { addPx } from '../utils/add-px'

function isFreelayout(node: BaseNode & ChildrenMixin) {
  return (
    (!('inferredAutoLayout' in node) || !node.inferredAutoLayout) &&
    'layoutPositioning' in node &&
    node.layoutPositioning === 'AUTO'
  )
}

export function getPositionProps(
  node: SceneNode,
): Record<string, string | undefined> | undefined {
  if (
    'parent' in node &&
    node.parent &&
    (('layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE') ||
      isFreelayout(node.parent)) &&
    'width' in node.parent &&
    'height' in node.parent
  ) {
    const constraints =
      'constraints' in node
        ? node.constraints
        : 'children' in node &&
            node.children[0] &&
            'constraints' in node.children[0]
          ? node.children[0].constraints
          : undefined
    if (!constraints) return
    const { horizontal, vertical } = constraints
    let left: string | undefined
    let right: string | undefined
    let top: string | undefined
    let bottom: string | undefined
    if (isFreelayout(node.parent)) {
      left = addPx(node.x) ?? '0px'
      top = addPx(node.y) ?? '0px'
    } else {
      switch (horizontal) {
        case 'MIN':
          left = addPx(node.x) ?? '0px'
          break
        case 'MAX':
          right = addPx(node.parent.width - node.x - node.width) ?? '0px'
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
          bottom = addPx(node.parent.height - node.y - node.height) ?? '0px'
          break
        default:
          top = '0px'
          bottom = '0px'
          break
      }
    }
    return {
      pos: 'absolute',
      left,
      right,
      top,
      bottom,
    }
  }
  if (
    'children' in node &&
    (node.children.some(
      (child) =>
        'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE',
    ) ||
      (isFreelayout(node) &&
        node.children.some(
          (child) =>
            'layoutPositioning' in child && child.layoutPositioning === 'AUTO',
        )))
  ) {
    return {
      pos: 'relative',
    }
  }
}
