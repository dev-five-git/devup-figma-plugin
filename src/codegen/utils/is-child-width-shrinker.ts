// child shrinker is a node that is a vertical flexbox with a center align-items
export function isChildWidthShrinker(node: BaseNode, type: 'width' | 'height') {
  if (
    'inferredAutoLayout' in node &&
    node.inferredAutoLayout &&
    ((type === 'width' &&
      node.inferredAutoLayout.layoutMode === 'VERTICAL' &&
      node.inferredAutoLayout.counterAxisAlignItems === 'CENTER') ||
      (type === 'height' &&
        node.inferredAutoLayout.layoutMode === 'HORIZONTAL' &&
        node.inferredAutoLayout.counterAxisAlignItems === 'CENTER'))
  ) {
    return true
  }
  return false
}
