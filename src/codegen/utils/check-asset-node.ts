export function checkAssetNode(node: SceneNode): 'svg' | 'png' | null {
  if (node.type === 'TEXT' || node.type === 'COMPONENT_SET') return null
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
        (Array.isArray(node.fills)
          ? node.fills.find((fill) => fill.visible)
          : true))
    )
      return null
    return checkAssetNode(children[0])
  }
  const fillterdChildren = children.filter((child) => child.visible)

  // return children.every((child) => child.visible && checkAssetNode(child))
  //   ? 'svg'
  //   : null
  console.log(fillterdChildren.map((child) => child.name).join(', '))
  return fillterdChildren.every((child) => {
    const result = checkAssetNode(child)
    if (result === null) return false
    return result === 'svg'
  })
    ? 'svg'
    : null
}
