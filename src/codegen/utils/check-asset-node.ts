export function checkAssetNode(node: SceneNode): 'svg' | 'png' | null {
  if (!('children' in node)) {
    return node.isAsset ? 'svg' : null
  }
  const { children } = node
  if (children.length === 1) return checkAssetNode(children[0])
  return children.some((child) => child.isAsset) ? 'svg' : null
}
