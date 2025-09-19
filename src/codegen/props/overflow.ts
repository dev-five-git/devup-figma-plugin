export function getOverflowProps(
  node: SceneNode,
): Record<string, string> | undefined {
  if ('clipsContent' in node && node.clipsContent)
    return {
      overflow: 'hidden',
    }
}
