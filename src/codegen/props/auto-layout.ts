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
    flexDir: {
      HORIZONTAL: 'row',
      VERTICAL: 'column',
    }[layoutMode],
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
  // const layoutMode = node.inferredAutoLayout!.layoutMode
  // switch (layoutMode) {
  //   case 'HORIZONTAL':
  //     if (node.layoutSizingHorizontal === 'HUG') return undefined
  //     break
  //   case 'VERTICAL':
  //     if (node.layoutSizingVertical === 'HUG') return undefined
  //     break
  //   default:
  //     break
  // }
  return {
    MIN: 'flex-start',
    MAX: 'flex-end',
    CENTER: 'center',
    SPACE_BETWEEN: 'space-between',
  }[node.primaryAxisAlignItems]
}

function getAlignItems(node: SceneNode & BaseFrameMixin): string | undefined {
  // const layoutMode = node.inferredAutoLayout!.layoutMode
  // switch (layoutMode) {
  //   case 'HORIZONTAL':
  //     if (
  //       node.children.length &&
  //       node.children.every(
  //         (child) =>
  //           child.visible &&
  //           'layoutSizingVertical' in child &&
  //           child.layoutSizingVertical === 'FILL' &&
  //           child.maxHeight === null,
  //       )
  //     )
  //       return
  //     if (node.layoutSizingVertical === 'HUG') {
  //       if (node.children.length > 1)
  //         for (const child of node.children)
  //           if (
  //             child.visible &&
  //             'layoutSizingVertical' in child &&
  //             child.layoutSizingVertical !== 'FILL'
  //           )
  //             return {
  //               MIN: 'flex-start',
  //               MAX: 'flex-end',
  //               CENTER: 'center',
  //               SPACE_BETWEEN: 'space-between',
  //               BASELINE: 'baseline',
  //             }[node.counterAxisAlignItems]
  //       return
  //     }
  //     break
  //   case 'VERTICAL':
  //     if (
  //       node.children.length &&
  //       node.children.every(
  //         (child) =>
  //           child.visible &&
  //           'layoutSizingHorizontal' in child &&
  //           child.layoutSizingHorizontal === 'FILL' &&
  //           child.maxWidth === null,
  //       )
  //     )
  //       return
  //     if (node.layoutSizingHorizontal === 'HUG') {
  //       if (node.children.length > 1)
  //         for (const child of node.children)
  //           if (
  //             child.visible &&
  //             'layoutSizingHorizontal' in child &&
  //             child.layoutSizingHorizontal !== 'FILL'
  //           )
  //             return {
  //               MIN: 'flex-start',
  //               MAX: 'flex-end',
  //               CENTER: 'center',
  //               SPACE_BETWEEN: 'space-between',
  //               BASELINE: 'baseline',
  //             }[node.counterAxisAlignItems]
  //       return
  //     }
  //     break
  //   default:
  //     break
  // }
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
  const sameGap = node.gridRowGap === node.gridColumnGap
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${node.gridColumnCount}, 1fr)`,
    gridTemplateRows: `repeat(${node.gridRowCount}, 1fr)`,
    rowGap: sameGap ? undefined : addPx(node.gridRowGap),
    columnGap: sameGap ? undefined : addPx(node.gridColumnGap),
    gap: sameGap ? addPx(node.gridRowGap) : undefined,
  }
}
