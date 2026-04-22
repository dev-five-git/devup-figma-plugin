import type { NodeTree } from '../types'

const IDENTIFIER_REGEX = /^[A-Za-z_$][\w$]*$/

export interface CollectedComponentProps {
  booleanProps: string[]
  textProps: string[]
  slotProps: string[]
}

export function collectComponentProps(tree: NodeTree): CollectedComponentProps {
  const booleanProps = new Set<string>()
  const textProps = new Set<string>()
  const slotProps = new Set<string>()

  const visit = (node: NodeTree) => {
    if (node.condition && IDENTIFIER_REGEX.test(node.condition)) {
      booleanProps.add(node.condition)
    }

    if (node.isSlot && IDENTIFIER_REGEX.test(node.component)) {
      slotProps.add(node.component)
    }

    if (
      node.textChildren?.length === 1 &&
      typeof node.textChildren[0] === 'string' &&
      /^\{[A-Za-z_$][\w$]*\}$/.test(node.textChildren[0])
    ) {
      const propName = node.textChildren[0].slice(1, -1)
      if (IDENTIFIER_REGEX.test(propName) && propName !== 'children') {
        textProps.add(propName)
      }
    }

    for (const child of node.children) {
      visit(child)
    }
  }

  visit(tree)

  return {
    booleanProps: [...booleanProps],
    textProps: [...textProps],
    slotProps: [...slotProps],
  }
}
