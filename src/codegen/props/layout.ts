import type { NodeContext } from '../types'
import { addPx } from '../utils/add-px'
import { checkAssetNode } from '../utils/check-asset-node'
import { getPageNode } from '../utils/get-page-node'
import { isChildWidthShrinker } from '../utils/is-child-width-shrinker'
import { resolveBoundVariable } from '../utils/resolve-bound-variable'
import { canBeAbsolute } from './position'

type BoundVars = Record<string, { id: string } | undefined> | undefined | null

function getBoundVars(node: SceneNode): BoundVars {
  return 'boundVariables' in node
    ? (node.boundVariables as BoundVars)
    : undefined
}

export async function getMinMaxProps(
  node: SceneNode,
): Promise<Record<string, boolean | string | number | undefined | null>> {
  const bv = getBoundVars(node)

  const [minWVar, maxWVar, minHVar, maxHVar] = await Promise.all([
    resolveBoundVariable(bv, 'minWidth'),
    resolveBoundVariable(bv, 'maxWidth'),
    resolveBoundVariable(bv, 'minHeight'),
    resolveBoundVariable(bv, 'maxHeight'),
  ])

  return {
    maxW: maxWVar ?? addPx(node.maxWidth),
    maxH: maxHVar ?? addPx(node.maxHeight),
    minW: minWVar ?? addPx(node.minWidth),
    minH: minHVar ?? addPx(node.minHeight),
  }
}

export async function getLayoutProps(
  node: SceneNode,
  ctx?: NodeContext,
): Promise<Record<string, boolean | string | number | undefined | null>> {
  const ret = await _getLayoutProps(node, ctx)
  if (ret.w && ret.h === ret.w) {
    ret.boxSize = ret.w
    delete ret.w
    delete ret.h
  }
  return ret
}

async function _getTextLayoutProps(
  node: TextNode,
): Promise<Record<
  string,
  boolean | string | number | undefined | null
> | null> {
  const bv = getBoundVars(node)

  switch (node.textAutoResize) {
    case 'WIDTH_AND_HEIGHT':
      return {}
    case 'HEIGHT': {
      const wVar = await resolveBoundVariable(bv, 'width')
      return {
        w: wVar ?? addPx(node.width),
      }
    }
    case 'NONE':
    case 'TRUNCATE':
      return null
  }
}

async function _getLayoutProps(
  node: SceneNode,
  ctx?: NodeContext,
): Promise<Record<string, boolean | string | number | undefined | null>> {
  const bv = getBoundVars(node)

  if (ctx ? ctx.canBeAbsolute : canBeAbsolute(node)) {
    const wVar = await resolveBoundVariable(bv, 'width')
    const hVar = await resolveBoundVariable(bv, 'height')

    return {
      w:
        node.type === 'TEXT' ||
        (node.parent &&
          'width' in node.parent &&
          node.parent.width > node.width)
          ? (ctx ? ctx.isAsset !== null : !!checkAssetNode(node)) ||
            ('children' in node && node.children.length === 0)
            ? (wVar ?? addPx(node.width))
            : undefined
          : '100%',
      // if node does not have children, it is a single node, so it should be 100%
      h:
        ('children' in node && node.children.length > 0) || node.type === 'TEXT'
          ? undefined
          : 'children' in node && node.children.length === 0
            ? (hVar ?? addPx(node.height))
            : '100%',
    }
  }
  const hType =
    'layoutSizingVertical' in node ? node.layoutSizingVertical : 'FILL'
  const wType =
    'layoutSizingHorizontal' in node ? node.layoutSizingHorizontal : 'FILL'
  if (node.type === 'TEXT' && hType === 'FIXED' && wType === 'FIXED') {
    const ret = await _getTextLayoutProps(node)
    if (ret) return ret
  }
  const aspectRatio =
    'targetAspectRatio' in node ? node.targetAspectRatio : undefined
  const rootNode = ctx
    ? ctx.pageNode
    : getPageNode(node as BaseNode & ChildrenMixin)

  const wVar =
    wType === 'FIXED' ? await resolveBoundVariable(bv, 'width') : null
  const hVar =
    hType === 'FIXED' ? await resolveBoundVariable(bv, 'height') : null

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
      rootNode === node
        ? undefined
        : wType === 'FIXED'
          ? (wVar ?? addPx(node.width))
          : wType === 'FILL' &&
              ((node.parent && isChildWidthShrinker(node.parent, 'width')) ||
                node.maxWidth !== null)
            ? '100%'
            : undefined,
    h:
      rootNode === node
        ? undefined
        : hType === 'FIXED'
          ? (hVar ?? addPx(node.height))
          : hType === 'FILL' &&
              ((node.parent && isChildWidthShrinker(node.parent, 'height')) ||
                node.maxHeight !== null)
            ? '100%'
            : undefined,
  }
}
