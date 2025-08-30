const DEFAULT_PROPS_MAP = {
  p: /\b0(px)?\b/,
  pr: /\b0(px)?\b/,
  pt: /\b0(px)?\b/,
  pb: /\b0(px)?\b/,
  px: /\b0(px)?\b/,
  py: /\b0(px)?\b/,
  pl: /\b0(px)?\b/,
  m: /\b0(px)?\b/,
  mt: /\b0(px)?\b/,
  mb: /\b0(px)?\b/,
  mr: /\b0(px)?\b/,
  ml: /\b0(px)?\b/,
  mx: /\b0(px)?\b/,
  my: /\b0(px)?\b/,
  textDecorationSkipInk: /\bauto\b/,
  textDecorationThickness: /\bauto\b/,
  textDecorationStyle: /\bsolid\b/,
  textDecorationColor: /\bauto\b/,
  textUnderlineOffset: /\bauto\b/,
  alignItems: /\bflex-start\b/,
  justifyContent: /\bflex-start\b/,
  flexDir: /\brow\b/,
  gap: /\b0(px)?\b/,
} as const
export function isDefaultProp(prop: string, value: unknown) {
  return (
    prop in DEFAULT_PROPS_MAP &&
    DEFAULT_PROPS_MAP[prop as keyof typeof DEFAULT_PROPS_MAP].test(
      String(value),
    )
  )
}
