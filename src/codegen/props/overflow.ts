export function getOverflowProps(
  node: SceneNode,
): Record<string, string> | undefined {
  const ret: Record<string, string> = {}
  if ('overflowDirection' in node) {
    switch (node.overflowDirection) {
      case 'NONE':
        break
      case 'HORIZONTAL':
        ret.overflowX = 'auto'
        break
      case 'VERTICAL':
        ret.overflowY = 'auto'
        break
      case 'BOTH':
        ret.overflow = 'auto'
        break
    }
  }

  if ('clipsContent' in node && node.clipsContent) ret.overflow = 'hidden'
  return ret
}
