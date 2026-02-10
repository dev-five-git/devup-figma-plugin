const DEFAULT_PROPS_MAP: Record<string, Set<string>> = {
  // p: new Set(['0', '0px']),
  // pr: new Set(['0', '0px']),
  // pt: new Set(['0', '0px']),
  // pb: new Set(['0', '0px']),
  // px: new Set(['0', '0px']),
  // py: new Set(['0', '0px']),
  // pl: new Set(['0', '0px']),
  // m: new Set(['0', '0px']),
  // mt: new Set(['0', '0px']),
  // mb: new Set(['0', '0px']),
  // mr: new Set(['0', '0px']),
  // ml: new Set(['0', '0px']),
  // mx: new Set(['0', '0px']),
  // my: new Set(['0', '0px']),
  textDecorationSkipInk: new Set(['auto']),
  textDecorationThickness: new Set(['auto']),
  textDecorationStyle: new Set(['solid']),
  textDecorationColor: new Set(['auto']),
  textUnderlineOffset: new Set(['auto']),
  alignItems: new Set(['flex-start']),
  justifyContent: new Set(['flex-start']),
  flexDir: new Set(['row']),
  gap: new Set(['0', '0px']),
}
export function isDefaultProp(prop: string, value: unknown) {
  // Don't filter arrays (responsive values)
  if (Array.isArray(value)) return false
  const defaults = DEFAULT_PROPS_MAP[prop]
  return defaults?.has(String(value)) ?? false
}
