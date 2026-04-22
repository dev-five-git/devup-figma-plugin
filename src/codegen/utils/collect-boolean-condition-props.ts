import type { NodeTree } from '../types'

const IDENTIFIER_REGEX = /^[A-Za-z_$][\w$]*$/

export function collectBooleanConditionProps(tree: NodeTree): string[] {
  const props = new Set<string>()

  const visit = (node: NodeTree) => {
    if (node.condition && IDENTIFIER_REGEX.test(node.condition)) {
      props.add(node.condition)
    }

    for (const child of node.children) {
      visit(child)
    }
  }

  visit(tree)
  return [...props]
}
