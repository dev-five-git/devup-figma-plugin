import { addPx } from '../utils/add-px'
import { getPageNode } from '../utils/get-page-node'
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
  const ret = _getLayoutProps(node)
  if (ret.w && ret.h === ret.w) {
    ret.boxSize = ret.w
    delete ret.w
    delete ret.h
  }
  return ret
}

function _getTextLayoutProps(
  node: TextNode,
): Record<string, boolean | string | number | undefined | null> | null {
  switch (node.textAutoResize) {
    case 'WIDTH_AND_HEIGHT':
      return {}
    case 'HEIGHT':
      return {
        w: addPx(node.width),
      }
    case 'NONE':
    case 'TRUNCATE':
      return null
  }
}

function _getLayoutProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> {
  const hType =
    'layoutSizingVertical' in node ? node.layoutSizingVertical : 'FILL'
  const wType =
    'layoutSizingHorizontal' in node ? node.layoutSizingHorizontal : 'FILL'
  if (node.type === 'TEXT' && hType === 'FIXED' && wType === 'FIXED') {
    const ret = _getTextLayoutProps(node)
    if (ret) return ret
  }
  const aspectRatio =
    'targetAspectRatio' in node ? node.targetAspectRatio : undefined
  const rootNode = 'children' in node ? getPageNode(node) : null

  return {
    aspectRatio: aspectRatio
      ? Math.floor((aspectRatio.x / aspectRatio.y) * 100) / 100
      : undefined,
    flex:
      wType === 'FILL' &&
      node.parent &&
      'layoutMode' in node.parent &&
      node.parent.layoutMode === 'HORIZONTAL'
        ? 1
        : undefined,
    w:
      rootNode === node && node.width === 1920
        ? undefined
        : wType === 'FIXED'
          ? addPx(node.width)
          : wType === 'FILL' &&
              node.parent &&
              isChildWidthShrinker(node.parent, 'width')
            ? '100%'
            : undefined,
    h:
      hType === 'FIXED'
        ? addPx(node.height)
        : hType === 'FILL' &&
            node.parent &&
            isChildWidthShrinker(node.parent, 'height')
          ? '100%'
          : undefined,
  }
}
