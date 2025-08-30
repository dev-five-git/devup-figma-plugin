import { addPx } from '../utils/add-px'
import { getPageNode } from '../utils/get-parge-node'
import { isChildWidthShrinker } from '../utils/is-child-width-shrinker'

export function getMinMaxProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> {
  return {
    maxW: addPx(node.maxWidth),
    maxH: addPx(node.maxHeight),
    minW: addPx(node.minWidth),
    minH: addPx(node.minHeight),
  }
}

export function getLayoutProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> {
  if (node.parent) {
    const h =
      'height' in node.parent && node.parent.height === node.height
        ? undefined
        : addPx(node.height)

    if (!isChildWidthShrinker(node.parent)) {
      return {
        h,
      }
    }
    if (
      node.parent &&
      'width' in node.parent &&
      node.width === node.parent.width
    ) {
      return {
        w: '100%',
        h,
      }
    }
    const pageNode = getPageNode(node.parent)
    if (pageNode && 'width' in pageNode && node.width === pageNode.width) {
      return {
        w: '100%',
        h,
      }
    }
  }
  return {
    w: node.width === 1920 ? '100%' : addPx(node.width),
    h: addPx(node.height),
  }
}
