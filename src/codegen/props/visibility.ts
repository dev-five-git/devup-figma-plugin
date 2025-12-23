export function getVisibilityProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  return node.visible
    ? undefined
    : {
        display: 'none',
      }
}
