const componentPropertyDefinitionsCache = new Map<
  string,
  ComponentSetNode['componentPropertyDefinitions']
>()

export function resetComponentPropertyDefinitionsCache(): void {
  componentPropertyDefinitionsCache.clear()
}

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

  const cacheKey = 'id' in node ? node.id : undefined
  if (cacheKey && componentPropertyDefinitionsCache.has(cacheKey)) {
    return componentPropertyDefinitionsCache.get(cacheKey) ?? {}
  }

  let result: ComponentSetNode['componentPropertyDefinitions']
  try {
    result =
      node.componentPropertyDefinitions ||
      ({} as ComponentSetNode['componentPropertyDefinitions'])
  } catch {
    result = {} as ComponentSetNode['componentPropertyDefinitions']
  }

  if (cacheKey) {
    componentPropertyDefinitionsCache.set(cacheKey, result)
  }
  return result
}
