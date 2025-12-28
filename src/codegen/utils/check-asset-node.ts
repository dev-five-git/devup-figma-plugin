function hasSmartAnimateReaction(node: BaseNode | null): boolean {
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') return false
  if (
    'reactions' in node &&
    node.reactions?.some((reaction) =>
      reaction.actions?.some(
        (action) =>
          action.type === 'NODE' && action.transition?.type === 'SMART_ANIMATE',
      ),
    )
  )
    return true
  return false
}

function isAnimationTarget(node: SceneNode): boolean {
  // Check if node itself has SMART_ANIMATE
  if (hasSmartAnimateReaction(node)) return true
  // Check if parent has SMART_ANIMATE (node is animation target as child)
  if (node.parent && hasSmartAnimateReaction(node.parent)) return true
  return false
}

export function checkAssetNode(
  node: SceneNode,
  nested = false,
): 'svg' | 'png' | null {
  if (
    node.type === 'TEXT' ||
    node.type === 'COMPONENT_SET' ||
    ('inferredAutoLayout' in node &&
      node.inferredAutoLayout?.layoutMode === 'GRID')
  )
    return null
  // if node is an animation target (has keyframes), it should not be treated as an asset
  if (isAnimationTarget(node)) return null
  // vector must be svg
  if (['VECTOR', 'STAR', 'POLYGON'].includes(node.type)) return 'svg'
  // ellipse with inner radius must be svg
  if (node.type === 'ELLIPSE' && node.arcData.innerRadius) return 'svg'
  if (!('children' in node) || node.children.length === 0) {
    if (
      'fills' in node &&
      Array.isArray(node.fills) &&
      // if node has tile, it is not an Image, it just has a tile background
      node.fills.find(
        (fill: Paint) =>
          fill.visible &&
          (fill.type === 'PATTERN' ||
            (fill.type === 'IMAGE' && fill.scaleMode === 'TILE')),
      )
    )
      return null
    return node.isAsset
      ? 'fills' in node && Array.isArray(node.fills)
        ? node.fills.some(
            (fill: Paint) =>
              fill.visible &&
              fill.type === 'IMAGE' &&
              fill.scaleMode !== 'TILE',
          )
          ? node.fills.length === 1
            ? 'png'
            : null
          : node.fills.every(
                (fill: Paint) => fill.visible && fill.type === 'SOLID',
              )
            ? nested
              ? 'svg'
              : null
            : 'svg'
        : null
      : nested &&
          'fills' in node &&
          Array.isArray(node.fills) &&
          node.fills.every((fill) => fill.visible && fill.type === 'SOLID')
        ? 'svg'
        : null
  }
  const { children } = node
  if (children.length === 1) {
    if (
      ('paddingLeft' in node &&
        (node.paddingLeft > 0 ||
          node.paddingRight > 0 ||
          node.paddingTop > 0 ||
          node.paddingBottom > 0)) ||
      ('fills' in node &&
        (Array.isArray(node.fills)
          ? node.fills.find((fill) => fill.visible)
          : true))
    )
      return null
    return checkAssetNode(children[0], true)
  }
  const fillterdChildren = children.filter((child) => child.visible)

  // return children.every((child) => child.visible && checkAssetNode(child))
  //   ? 'svg'
  //   : null
  return fillterdChildren.every((child) => {
    const result = checkAssetNode(child, true)
    if (result === null) return false
    return result === 'svg'
  })
    ? 'svg'
    : null
}
