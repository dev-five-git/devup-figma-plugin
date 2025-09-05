export function checkAssetNode(node: SceneNode): 'svg' | 'png' | null {
  if (node.isAsset) return 'svg'
  if (!('children' in node) || node.children.length === 0) {
    return node.isAsset ? 'svg' : null
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
  return children.every((child) => child.visible && child.isAsset)
    ? 'svg'
    : null
}
