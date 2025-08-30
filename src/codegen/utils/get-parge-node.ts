export function getPageNode(node: BaseNode & ChildrenMixin) {
  if (!node.parent) return null
  switch (node.parent.type) {
    case 'SECTION':
    case 'PAGE':
      return node
    default:
      return getPageNode(node.parent)
  }
}
