export function checkAssetNode(node: SceneNode): 'svg' | 'png' | null {
  // vector must be svg
  if (['VECTOR', 'STAR', 'POLYGON'].includes(node.type)) return 'svg'
  // ellipse with inner radius must be svg
  if (node.type === 'ELLIPSE' && node.arcData.innerRadius) return 'svg'
  if (!('children' in node) || node.children.length === 0) {
    if (
      'fills' in node &&
      Array.isArray(node.fills) &&
      // if node has tile, it is not an Image, it just has a tile background
      node.fills.find(
        (fill: Paint) =>
          fill.visible &&
          (fill.type === 'PATTERN' ||
            (fill.type === 'IMAGE' && fill.scaleMode === 'TILE')),
      )
    )
      return null
    return node.isAsset
      ? 'fills' in node && Array.isArray(node.fills)
        ? node.fills.some(
            (fill: Paint) =>
              fill.visible &&
              fill.type === 'IMAGE' &&
              fill.scaleMode !== 'TILE',
          )
          ? 'png'
          : node.fills.every(
                (fill: Paint) => fill.visible && fill.type === 'SOLID',
              )
            ? null
            : 'svg'
        : null
      : null
  }
  const { children } = node
  if (children.length === 1) {
    if (
      ('paddingLeft' in node &&
        (node.paddingLeft > 0 ||
          node.paddingRight > 0 ||
          node.paddingTop > 0 ||
          node.paddingBottom > 0)) ||
      ('fills' in node &&
        (Array.isArray(node.fills) ? node.fills.length > 0 : true))
    )
      return null

    return checkAssetNode(children[0])
  }
  return children.every((child) => child.visible && checkAssetNode(child))
    ? 'svg'
    : null
}
