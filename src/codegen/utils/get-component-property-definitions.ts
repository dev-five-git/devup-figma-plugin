/**
 * Safely access componentPropertyDefinitions on a node.
 * Figma's getter throws when the component set has validation errors
 * (e.g. duplicate variant names, missing properties).
 * Returns an empty object on error so callers can iterate safely.
 */
export function getComponentPropertyDefinitions(
  node: ComponentSetNode | ComponentNode | null | undefined,
): ComponentSetNode['componentPropertyDefinitions'] {
  if (!node) {
    return {} as ComponentSetNode['componentPropertyDefinitions']
  }
  try {
    return (
      node.componentPropertyDefinitions ||
      ({} as ComponentSetNode['componentPropertyDefinitions'])
    )
  } catch {
    return {} as ComponentSetNode['componentPropertyDefinitions']
  }
}
