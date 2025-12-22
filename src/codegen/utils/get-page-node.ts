export function getPageNode(node: BaseNode & ChildrenMixin) {
  if (!node.parent) return null
  switch (node.parent.type) {
    case 'COMPONENT_SET':
    case 'SECTION':
    case 'PAGE':
      if (['SECTION', 'PAGE'].includes(node.type)) return null
      return node
    default:
      return getPageNode(node.parent)
  }
}
