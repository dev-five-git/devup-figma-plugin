import { toCamel } from './utils/to-camel'
import { toPascal } from './utils/to-pascal'

// Cache for figma.getLocalTextStylesAsync() — called once per codegen run
let localTextStyleIdsCache: Promise<Set<string>> | null = null

function getLocalTextStyleIds(): Promise<Set<string>> {
  if (localTextStyleIdsCache) return localTextStyleIdsCache
  localTextStyleIdsCache = Promise.resolve(
    figma.getLocalTextStylesAsync(),
  ).then((styles) => new Set(styles.map((s) => s.id)))
  return localTextStyleIdsCache
}

// Cache for figma.getStyleByIdAsync() — keyed by style ID
const styleByIdCache = new Map<string, Promise<BaseStyle | null>>()

function getStyleByIdCached(styleId: string): Promise<BaseStyle | null> {
  const cached = styleByIdCache.get(styleId)
  if (cached) return cached
  const promise = Promise.resolve(figma.getStyleByIdAsync(styleId))
  styleByIdCache.set(styleId, promise)
  return promise
}

export function resetTextStyleCache(): void {
  localTextStyleIdsCache = null
  styleByIdCache.clear()
}

export async function propsToPropsWithTypography(
  props: Record<string, unknown>,
  textStyleId: string,
) {
  const ret: Record<string, unknown> = { ...props }
  delete ret.w
  delete ret.h
  const localStyleIds = await getLocalTextStyleIds()
  if (textStyleId && localStyleIds.has(textStyleId)) {
    const style = await getStyleByIdCached(textStyleId)
    if (style) {
      const split = style.name.split('/')
      ret.typography = toCamel(split[split.length - 1])
      delete ret.fontFamily
      delete ret.fontSize
      delete ret.fontWeight
      delete ret.fontStyle
      delete ret.letterSpacing
      delete ret.lineHeight
    }
  }
  return ret
}

export function space(depth: number) {
  return ' '.repeat(depth * 2)
}

export function getComponentName(node: SceneNode) {
  if (node.type === 'COMPONENT_SET') return toPascal(node.name)
  if (node.type === 'COMPONENT')
    return toPascal(
      node.parent?.type === 'COMPONENT_SET' ? node.parent.name : node.name,
    )
  return toPascal(node.name)
}
