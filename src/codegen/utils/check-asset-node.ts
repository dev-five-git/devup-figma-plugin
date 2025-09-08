export function checkAssetNode(node: SceneNode): 'svg' | 'png' | null {
  if (node.type === 'ELLIPSE' && node.arcData.innerRadius) return 'svg'
  if (!('children' in node) || node.children.length === 0) {
    return (node.isAsset &&
      'fills' in node &&
      Array.isArray(node.fills) &&
      // if node has tile, it is not an Image, it just has a tile background
      !node.fills.find(
        (fill: Paint) =>
          fill.visible &&
          (fill.type === 'PATTERN' ||
            (fill.type === 'IMAGE' &&
              !!fill.visible &&
              fill.scaleMode === 'TILE')),
      ) &&
      !['RECTANGLE', 'ELLIPSE'].includes(node.type)) ||
      ['VECTOR'].includes(node.type)
      ? 'svg'
      : null
  }
  const { children } = node
  if (children.length === 1) {
    if (
      'paddingLeft' in node &&
      (node.paddingLeft > 0 ||
        node.paddingRight > 0 ||
        node.paddingTop > 0 ||
        node.paddingBottom > 0)
    )
      return null

    return checkAssetNode(children[0])
  }
  return children.every((child) => child.visible && checkAssetNode(child))
    ? 'svg'
    : null
}
