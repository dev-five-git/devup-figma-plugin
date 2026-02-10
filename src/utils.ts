import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

// Cache for figma.getLocalTextStylesAsync() — called once per codegen run
let localTextStyleIdsCache: Promise<Set<string>> | null = null
let localTextStyleIdsResolved: Set<string> | null = null

function getLocalTextStyleIds(): Promise<Set<string>> {
  if (localTextStyleIdsCache) return localTextStyleIdsCache
  localTextStyleIdsCache = Promise.resolve(
    figma.getLocalTextStylesAsync(),
  ).then((styles) => {
    const set = new Set(styles.map((s) => s.id))
    localTextStyleIdsResolved = set
    return set
  })
  return localTextStyleIdsCache
}

// Cache for figma.getStyleByIdAsync() — keyed by style ID
const styleByIdCache = new Map<string, Promise<BaseStyle | null>>()
const styleByIdResolved = new Map<string, BaseStyle | null>()

function getStyleByIdCached(styleId: string): Promise<BaseStyle | null> {
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
  localTextStyleIdsCache = null
  localTextStyleIdsResolved = null
  styleByIdCache.clear()
  styleByIdResolved.clear()
}

function applyTypographyStyle(
  ret: Record<string, unknown>,
  style: BaseStyle,
): void {
  const split = style.name.split('/')
  ret.typography = toCamel(split[split.length - 1])
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

  // Sync fast path: if both caches are resolved, skip await entirely
  if (localTextStyleIdsResolved !== null) {
    if (textStyleId && localTextStyleIdsResolved.has(textStyleId)) {
      const style = styleByIdResolved.get(textStyleId)
      if (style !== undefined) {
        if (style) applyTypographyStyle(ret, style)
        return ret
      }
      // Style not yet resolved — fall through to async
    } else {
      return ret
    }
  }

  // Async fallback (first call or style not yet in resolved cache)
  const localStyleIds = await getLocalTextStyleIds()
  if (textStyleId && localStyleIds.has(textStyleId)) {
    const style = await getStyleByIdCached(textStyleId)
    if (style) applyTypographyStyle(ret, style)
  }
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
