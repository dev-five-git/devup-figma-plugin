import type { NodeContext } from '../types'
import { addPx } from '../utils/add-px'
import { checkAssetNode } from '../utils/check-asset-node'

export function getAutoLayoutProps(
  node: SceneNode,
  ctx?: NodeContext,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (
    !('inferredAutoLayout' in node) ||
    !node.inferredAutoLayout ||
    node.inferredAutoLayout.layoutMode === 'NONE' ||
    (ctx ? ctx.isAsset !== null : !!checkAssetNode(node))
  )
    return
  const { layoutMode } = node.inferredAutoLayout
  if (layoutMode === 'GRID') return getGridProps(node)
  let childrenCount = 0
  for (const c of node.children) if (c.visible) childrenCount++
  return {
    display: {
      HORIZONTAL: 'flex',
      VERTICAL: 'flex',
    }[layoutMode],
    flexDir: {
      HORIZONTAL: 'row',
      VERTICAL: 'column',
    }[layoutMode],
    gap:
      childrenCount > 1 && node.primaryAxisAlignItems !== 'SPACE_BETWEEN'
        ? addPx(node.inferredAutoLayout.itemSpacing)
        : undefined,
    justifyContent: getJustifyContent(node),
    alignItems: getAlignItems(node),
  }
}

function getJustifyContent(
  node: SceneNode & BaseFrameMixin,
): string | undefined {
  return {
    MIN: 'flex-start',
    MAX: 'flex-end',
    CENTER: 'center',
    SPACE_BETWEEN: 'space-between',
  }[node.primaryAxisAlignItems]
}

function getAlignItems(node: SceneNode & BaseFrameMixin): string | undefined {
  return {
    MIN: 'flex-start',
    MAX: 'flex-end',
    CENTER: 'center',
    SPACE_BETWEEN: 'space-between',
    BASELINE: 'baseline',
  }[node.counterAxisAlignItems]
}

function getGridProps(
  node: GridLayoutMixin,
): Record<string, boolean | undefined | string | number | null> {
  // Round to 2 decimal places to handle Figma floating-point imprecision
  const sameGap =
    Math.round(node.gridRowGap * 100) / 100 ===
    Math.round(node.gridColumnGap * 100) / 100
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${node.gridColumnCount}, 1fr)`,
    gridTemplateRows: `repeat(${node.gridRowCount}, 1fr)`,
    rowGap: sameGap ? undefined : addPx(node.gridRowGap),
    columnGap: sameGap ? undefined : addPx(node.gridColumnGap),
    gap: sameGap ? addPx(node.gridRowGap) : undefined,
  }
}
