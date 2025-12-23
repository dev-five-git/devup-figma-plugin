export function getCursorProps(node: SceneNode): Record<string, string> {
  if (!('reactions' in node) || !node.reactions) {
    return {}
  }

  // Check if any reaction has ON_CLICK trigger
  const hasClickTrigger = node.reactions.some(
    (reaction) => reaction.trigger?.type === 'ON_CLICK',
  )

  if (hasClickTrigger) {
    return { cursor: 'pointer' }
  }

  return {}
}
