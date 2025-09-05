import { addPx } from '../utils/add-px'

export function getAutoLayoutProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (
    !('inferredAutoLayout' in node) ||
    !node.inferredAutoLayout ||
    node.inferredAutoLayout.layoutMode === 'NONE'
  )
    return
  const { layoutMode } = node.inferredAutoLayout
  if (layoutMode === 'GRID') return getGridProps(node)
  const childrenCount = node.children.filter((c) => c.visible).length
  return {
    display: {
      HORIZONTAL: 'flex',
      VERTICAL: 'flex',
    }[layoutMode],
    flexDir:
      childrenCount > 0
        ? {
            HORIZONTAL: 'row',
            VERTICAL: 'column',
          }[layoutMode]
        : undefined,
    gap:
      childrenCount > 1
        ? addPx(node.inferredAutoLayout.itemSpacing)
        : undefined,
    justifyContent: getJustifyContent(node),
    alignItems: getAlignItems(node),
  }
}

function getJustifyContent(
  node: SceneNode & BaseFrameMixin,
): string | undefined {
  const layoutMode = node.inferredAutoLayout!.layoutMode
  switch (layoutMode) {
    case 'HORIZONTAL':
      if (node.layoutSizingHorizontal === 'HUG') return undefined
      break
    case 'VERTICAL':
      if (node.layoutSizingVertical === 'HUG') return undefined
      break
    default:
      break
  }
  return {
    MIN: 'flex-start',
    MAX: 'flex-end',
    CENTER: 'center',
    SPACE_BETWEEN: 'space-between',
  }[node.primaryAxisAlignItems]
}

function getAlignItems(node: SceneNode & BaseFrameMixin): string | undefined {
  const layoutMode = node.inferredAutoLayout!.layoutMode
  switch (layoutMode) {
    case 'HORIZONTAL':
      if (node.layoutSizingVertical === 'HUG') {
        if (node.children.length > 1)
          for (const child of node.children)
            if (
              child.visible &&
              'layoutSizingVertical' in child &&
              child.layoutSizingVertical !== 'FILL'
            )
              return {
                MIN: 'flex-start',
                MAX: 'flex-end',
                CENTER: 'center',
                SPACE_BETWEEN: 'space-between',
                BASELINE: 'baseline',
              }[node.counterAxisAlignItems]
        return undefined
      }
      break
    case 'VERTICAL':
      if (node.layoutSizingHorizontal === 'HUG') {
        if (node.children.length > 1)
          for (const child of node.children)
            if (
              child.visible &&
              'layoutSizingHorizontal' in child &&
              child.layoutSizingHorizontal !== 'FILL'
            )
              return {
                MIN: 'flex-start',
                MAX: 'flex-end',
                CENTER: 'center',
                SPACE_BETWEEN: 'space-between',
                BASELINE: 'baseline',
              }[node.counterAxisAlignItems]
      }
      break
    default:
      break
  }
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
  return {
    gridTemplateColumns: node.gridColumnCount,
    gridTemplateRows: node.gridRowCount,
  }
}
