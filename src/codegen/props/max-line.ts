export function getMaxLineProps(
  node: SceneNode,
): Record<string, string> | undefined {
  if (node.type !== 'TEXT' || !node.maxLines) return
  if (node.maxLines === 1)
    return {
      whiteSpace: 'nowrap',
    }
  return {
    WebkitLineClamp: String(node.maxLines),
    WebkitBoxOrient: 'vertical',
    display: '-webkit-box',
  }
}
