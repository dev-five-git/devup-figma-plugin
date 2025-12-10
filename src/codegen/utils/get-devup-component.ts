export function getDevupComponentByNode(
  node: SceneNode,
  props: Record<string, unknown>,
) {
  switch (node.type) {
    case 'TEXT':
      return 'Text'
    default:
      return getDevupComponentByProps(props)
  }
}

export function getDevupComponentByProps(props: Record<string, unknown>) {
  switch (props.display) {
    case 'flex':
      if (props.alignItems === 'center' && props.justifyContent === 'center') {
        return 'Center'
      }
      return props.flexDir === 'column' ? 'VStack' : 'Flex'
    case 'grid':
      return 'Grid'
    default:
      return 'Box'
  }
}
