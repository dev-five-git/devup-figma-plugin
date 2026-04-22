import { styleNameToTypography } from './utils/style-name-to-typography'
import { toPascal } from './utils/to-pascal'

// Cache for figma.getStyleByIdAsync() — keyed by style ID
const styleByIdCache = new Map<string, Promise<BaseStyle | null>>()
const styleByIdResolved = new Map<string, BaseStyle | null>()

export function getStyleByIdCached(styleId: string): Promise<BaseStyle | null> {
  const cached = styleByIdCache.get(styleId)
  if (cached) return cached
  const promise = Promise.resolve(figma.getStyleByIdAsync(styleId)).then(
    (s) => {
      styleByIdResolved.set(styleId, s)
      return s
    },
  )
  styleByIdCache.set(styleId, promise)
  return promise
}

export function resetTextStyleCache(): void {
  styleByIdCache.clear()
  styleByIdResolved.clear()
}

function applyTypographyStyle(
  ret: Record<string, unknown>,
  style: BaseStyle,
): void {
  // Must match the key that export-devup.ts writes via styleNameToTypography,
  // otherwise `typography="..."` references miss the exported devup.json key.
  // Only breakpoint prefixes (mobile/tablet/desktop/{number}) are stripped;
  // scoped prefixes like `cms/bodyLgBold` stay intact → `cmsBodyLgBold`.
  ret.typography = styleNameToTypography(style.name).name
  delete ret.fontFamily
  delete ret.fontSize
  delete ret.fontWeight
  delete ret.fontStyle
  delete ret.letterSpacing
  delete ret.lineHeight
}

export async function propsToPropsWithTypography(
  props: Record<string, unknown>,
  textStyleId: string,
) {
  const ret: Record<string, unknown> = { ...props }
  delete ret.w
  delete ret.h

  if (!textStyleId) return ret

  // Sync fast path: if style already resolved, skip await entirely
  const resolvedStyle = styleByIdResolved.get(textStyleId)
  if (resolvedStyle !== undefined) {
    if (resolvedStyle) applyTypographyStyle(ret, resolvedStyle)
    return ret
  }

  // Async fallback: resolve style by ID (works for both local and library styles)
  const style = await getStyleByIdCached(textStyleId)
  if (style) applyTypographyStyle(ret, style)
  return ret
}

const _spaceCache: string[] = []
export function space(depth: number) {
  if (_spaceCache[depth] === undefined)
    _spaceCache[depth] = ' '.repeat(depth * 2)
  return _spaceCache[depth]
}

export function getComponentName(node: SceneNode) {
  if (node.type === 'COMPONENT_SET') return toPascal(node.name)
  if (node.type === 'COMPONENT')
    return toPascal(
      node.parent?.type === 'COMPONENT_SET' ? node.parent.name : node.name,
    )
  return toPascal(node.name)
}
