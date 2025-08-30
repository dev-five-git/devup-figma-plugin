import { addPx } from '../utils/add-px'

export function getAutoLayoutProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> {
  if (
    !('inferredAutoLayout' in node) ||
    !node.inferredAutoLayout ||
    node.inferredAutoLayout.layoutMode === 'NONE'
  )
    return {}
  const { layoutMode } = node.inferredAutoLayout
  if (layoutMode === 'GRID') return getGridProps(node)
  return {
    display: {
      HORIZONTAL: 'flex',
      VERTICAL: 'flex',
    }[layoutMode],
    flexDir: {
      HORIZONTAL: 'row',
      VERTICAL: 'column',
    }[layoutMode],
    gap: addPx(node.inferredAutoLayout.itemSpacing),
    justifyContent: {
      MIN: 'flex-start',
      MAX: 'flex-end',
      CENTER: 'center',
      SPACE_BETWEEN: 'space-between',
    }[node.primaryAxisAlignItems],
    alignItems: node.counterAxisAlignItems
      ? {
          MIN: 'flex-start',
          MAX: 'flex-end',
          CENTER: 'center',
          SPACE_BETWEEN: 'space-between',
          BASELINE: 'baseline',
        }[node.counterAxisAlignItems]
      : undefined,
  }
}

function getGridProps(
  node: GridLayoutMixin,
): Record<string, boolean | undefined | string | number | null> {
  return {
    gridTemplateColumns: node.gridColumnCount,
    gridTemplateRows: node.gridRowCount,
  }
}
