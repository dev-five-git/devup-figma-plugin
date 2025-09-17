export function getGridChildProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (
    'gridColumnAnchorIndex' in node &&
    'gridRowAnchorIndex' in node &&
    node.parent &&
    'inferredAutoLayout' in node.parent &&
    node.parent.inferredAutoLayout &&
    node.parent.inferredAutoLayout.layoutMode === 'GRID'
  ) {
    const parent = node.parent as GridLayoutMixin & ChildrenMixin
    const columnCount = parent.gridColumnCount
    const currentIdx =
      node.gridColumnAnchorIndex + node.gridRowAnchorIndex * columnCount
    if (parent.children[currentIdx] !== node) {
      return {
        gridColumn: `${node.gridColumnAnchorIndex + 1} / span 1`,
        gridRow: `${node.gridRowAnchorIndex + 1} / span 1`,
      }
    }
  }
}
