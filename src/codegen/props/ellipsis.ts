export function getEllipsisProps(
  node: SceneNode,
): Record<string, string> | undefined {
  if (
    node.type !== 'TEXT' ||
    node.textTruncation === 'DISABLED' ||
    node.layoutSizingHorizontal === 'HUG'
  )
    return
  return {
    textOverflow: 'ellipsis',
    overflow: 'hidden',
  }
}
