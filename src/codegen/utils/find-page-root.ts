import { isPageRoot } from './is-page-root'

export function findPageRoot(node: BaseNode) {
  while (!isPageRoot(node)) {
    node = node.parent as BaseNode
  }
  return node
}
