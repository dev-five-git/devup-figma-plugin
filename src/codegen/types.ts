export type Props = Record<string, unknown>

export interface NodeTree {
  component: string // 'Flex', 'Box', 'Text', 'Image', or component name
  props: Props
  children: NodeTree[]
  nodeType: string // Figma node type: 'FRAME', 'TEXT', 'INSTANCE', etc.
  nodeName: string // Figma node name
  isComponent?: boolean // true if this is a component reference (INSTANCE)
  textChildren?: string[] // raw text content for TEXT nodes
}

export interface ComponentTree {
  name: string
  node: SceneNode
  tree: NodeTree
  variants: Record<string, string>
}
