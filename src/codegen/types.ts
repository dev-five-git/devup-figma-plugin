export interface NodeContext {
  isAsset: 'svg' | 'png' | null
  canBeAbsolute: boolean
  isPageRoot: boolean
  pageNode: SceneNode | null
}

export type Props = Record<string, unknown>

export interface NodeTree {
  component: string // 'Flex', 'Box', 'Text', 'Image', or component name
  props: Props
  children: NodeTree[]
  nodeType: string // Figma node type: 'FRAME', 'TEXT', 'INSTANCE', 'SLOT', etc.
  nodeName: string // Figma node name
  isComponent?: boolean // true if this is a component reference (INSTANCE)
  isSlot?: boolean // true if this is an INSTANCE_SWAP slot — renders as {component}
  condition?: string // BOOLEAN prop name — renders as {condition && <.../>}
  textChildren?: string[] // raw text content for TEXT nodes
}

export interface ComponentTree {
  name: string
  node: SceneNode
  tree: NodeTree
  variants: Record<string, string>
  variantComments?: Record<string, string>
}
