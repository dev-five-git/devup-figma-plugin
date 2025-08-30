// child shrinker is a node that is a vertical flexbox with a center align-items
export function isChildWidthShrinker(node: BaseNode) {
  if (
    'inferredAutoLayout' in node &&
    node.inferredAutoLayout &&
    node.inferredAutoLayout.layoutMode === 'VERTICAL' &&
    node.inferredAutoLayout.counterAxisAlignItems === 'CENTER'
  ) {
    return true
  }
  return false
}
