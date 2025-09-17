export function getTextAlignProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (node.type !== 'TEXT') return
  const hType = node.textAutoResize.includes('HEIGHT')
    ? 'HUG'
    : 'layoutSizingVertical' in node
      ? node.layoutSizingVertical
      : 'FILL'
  const wType = node.textAutoResize.includes('WIDTH')
    ? 'HUG'
    : 'layoutSizingHorizontal' in node
      ? node.layoutSizingHorizontal
      : 'FILL'
  return {
    textAlign:
      wType === 'HUG'
        ? null
        : {
            // default value
            LEFT: null,
            CENTER: 'center',
            RIGHT: 'right',
            JUSTIFIED: 'justify',
          }[node.textAlignHorizontal],
    alignContent:
      hType === 'HUG'
        ? null
        : {
            TOP: null,
            CENTER: 'center',
            BOTTOM: 'end',
          }[node.textAlignVertical],
  }
}
