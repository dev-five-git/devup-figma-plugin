import { toPascal } from '../../utils/to-pascal'

export function getComponentName(node: SceneNode) {
  if (node.type === 'COMPONENT_SET') return toPascal(node.name)
  if (node.type === 'COMPONENT')
    return toPascal(
      node.parent?.type === 'COMPONENT_SET' ? node.parent.name : node.name,
    )
  return toPascal(node.name)
}
