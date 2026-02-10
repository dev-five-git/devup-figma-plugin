// Global cache for figma.variables.getVariableByIdAsync() results.
// This is the single hottest Figma API call — used by solidToString,
// processGradientStopColor, and transitively by every prop getter that
// resolves colors (border, background, text-stroke, reaction, renderText).
// Keyed by variable ID; stores the Promise to deduplicate concurrent calls.
const variableByIdCache = new Map<string, Promise<Variable | null>>()

export function getVariableByIdCached(
  variableId: string,
): Promise<Variable | null> {
  const cached = variableByIdCache.get(variableId)
  if (cached) return cached
  const promise = Promise.resolve(
    figma.variables.getVariableByIdAsync(variableId),
  )
  variableByIdCache.set(variableId, promise)
  return promise
}

export function resetVariableCache(): void {
  variableByIdCache.clear()
}
