export function isPageRoot(node: BaseNode) {
  return (
    node.parent?.type === 'PAGE' ||
    node.parent?.type === 'SECTION' ||
    node.parent?.type === 'COMPONENT_SET'
  )
}
