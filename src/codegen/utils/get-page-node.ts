const pageNodeCache = new Map<string, (BaseNode & ChildrenMixin) | null>()

export function resetGetPageNodeCache(): void {
  pageNodeCache.clear()
}

export function getPageNode(
  node: BaseNode & ChildrenMixin,
): (BaseNode & ChildrenMixin) | null {
  const cacheKey = 'id' in node ? node.id : undefined
  if (cacheKey && pageNodeCache.has(cacheKey)) {
    return pageNodeCache.get(cacheKey) ?? null
  }

  const result: (BaseNode & ChildrenMixin) | null = computePageNode(node)
  if (cacheKey) pageNodeCache.set(cacheKey, result)
  return result
}

function computePageNode(
  node: BaseNode & ChildrenMixin,
): (BaseNode & ChildrenMixin) | null {
  if (!node.parent) return null
  switch (node.parent.type) {
    case 'COMPONENT_SET':
    case 'SECTION':
    case 'PAGE':
      if (['SECTION', 'PAGE'].includes(node.type)) return null
      return node
    default:
      return getPageNode(node.parent)
  }
}
