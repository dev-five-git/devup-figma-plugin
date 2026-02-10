import { perfEnd, perfStart } from '../utils/perf'
import { getAutoLayoutProps } from './auto-layout'
import { getBackgroundProps } from './background'
import { getBlendProps } from './blend'
import { getBorderProps, getBorderRadiusProps } from './border'
import { getCursorProps } from './cursor'
import { getEffectProps } from './effect'
import { getEllipsisProps } from './ellipsis'
import { getGridChildProps } from './grid-child'
import { getLayoutProps, getMinMaxProps } from './layout'
import { getMaxLineProps } from './max-line'
import { getObjectFitProps } from './object-fit'
import { getOverflowProps } from './overflow'
import { getPaddingProps } from './padding'
import { getPositionProps } from './position'
import { getReactionProps } from './reaction'
import { getTextAlignProps } from './text-align'
import { getTextShadowProps } from './text-shadow'
import { getTextStrokeProps } from './text-stroke'
import { getTransformProps } from './transform'
import { getVisibilityProps } from './visibility'

// Cache getProps() results keyed by node.id to avoid redundant computation.
// Figma returns new JS wrapper objects for the same node on each property access,
// so object-reference keys don't work — node.id is the stable identifier.
// For a COMPONENT_SET with N variants, getProps() is called O(N²) without caching
// because getSelectorProps/getSelectorPropsForGroup call it on overlapping node sets.
const getPropsCache = new Map<string, Promise<Record<string, unknown>>>()

export function resetGetPropsCache(): void {
  getPropsCache.clear()
}

export async function getProps(
  node: SceneNode,
): Promise<Record<string, unknown>> {
  const cacheKey = node.id
  if (cacheKey) {
    const cached = getPropsCache.get(cacheKey)
    if (cached) {
      perfEnd('getProps(cached)', perfStart())
      // Return a shallow clone to prevent mutation of cached values
      return { ...(await cached) }
    }
  }

  const t = perfStart()
  const promise = (async () => {
    const isText = node.type === 'TEXT'

    // Fire all async prop getters in parallel — they are independent
    // (no shared mutable state, no inter-function data dependencies).
    // Skip TEXT-only async getters for non-TEXT nodes.
    const [
      borderProps,
      backgroundProps,
      effectProps,
      textStrokeProps,
      textShadowProps,
      reactionProps,
    ] = await Promise.all([
      getBorderProps(node),
      getBackgroundProps(node),
      getEffectProps(node),
      isText ? getTextStrokeProps(node) : undefined,
      isText ? getTextShadowProps(node) : undefined,
      getReactionProps(node),
    ])

    return {
      ...getAutoLayoutProps(node),
      ...getMinMaxProps(node),
      ...getLayoutProps(node),
      ...getBorderRadiusProps(node),
      ...borderProps,
      ...backgroundProps,
      ...getBlendProps(node),
      ...getPaddingProps(node),
      ...(isText ? getTextAlignProps(node) : undefined),
      ...getObjectFitProps(node),
      ...(isText ? getMaxLineProps(node) : undefined),
      ...(isText ? getEllipsisProps(node) : undefined),
      ...effectProps,
      ...getPositionProps(node),
      ...getGridChildProps(node),
      ...getTransformProps(node),
      ...getOverflowProps(node),
      ...textStrokeProps,
      ...textShadowProps,
      ...reactionProps,
      ...getCursorProps(node),
      ...getVisibilityProps(node),
    }
  })()

  if (cacheKey) {
    getPropsCache.set(cacheKey, promise)
  }
  const result = await promise
  perfEnd('getProps()', t)
  return result
}

export function filterPropsWithComponent(
  component: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const newProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    switch (component) {
      case 'Flex':
        // Only skip display/flexDir if it's exactly the default value (not responsive array)
        if (key === 'display' && value === 'flex') continue
        if (key === 'flexDir' && value === 'row') continue
        break
      case 'Grid':
        // Only skip display if it's exactly 'grid' (not responsive array or other value)
        if (key === 'display' && value === 'grid') continue
        break
      case 'Center':
        if (['alignItems', 'justifyContent'].includes(key)) continue
        if (key === 'display' && value === 'flex') continue
        if (key === 'flexDir' && value === 'row') continue
        break
      case 'VStack':
        // Only skip flexDir if it's exactly 'column' (not responsive array or other value)
        if (key === 'flexDir' && value === 'column') continue
        if (key === 'display' && value === 'flex') continue
        break

      case 'Image':
      case 'Box':
        if (component === 'Box' && !('maskImage' in props)) break
        if (
          [
            'alignItems',
            'justifyContent',
            'flexDir',
            'gap',
            'outline',
            'outlineOffset',
            'overflow',
          ].includes(key)
        )
          continue
        if (key === 'display' && value === 'flex') continue
        if (!('maskImage' in props) && ['bg'].includes(key)) continue
        break
    }
    newProps[key] = value
  }
  return newProps
}
