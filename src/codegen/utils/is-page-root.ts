import { getPageNode } from './get-page-node'

export function isPageRoot(node: BaseNode) {
  return getPageNode(node as BaseNode & ChildrenMixin) === node
}
