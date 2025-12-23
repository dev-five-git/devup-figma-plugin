import { getPageNode } from './get-page-node'

export function isPageRoot(node: BaseNode | null | undefined) {
  if (!node) return false
  return getPageNode(node as BaseNode & ChildrenMixin) === node
}
