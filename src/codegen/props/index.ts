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

    // PHASE 1: Fire all async prop getters — initiates Figma IPC calls immediately.
    // These return Promises that resolve when IPC completes.
    const tBorder = perfStart()
    const borderP = getBorderProps(node)
    const tBg = perfStart()
    const bgP = getBackgroundProps(node)
    const tTextStroke = perfStart()
    const textStrokeP = isText ? getTextStrokeProps(node) : undefined
    const tReaction = perfStart()
    const reactionP = getReactionProps(node)

    // PHASE 2: Run sync prop getters while async IPC is pending in background.
    // This overlaps ~129ms of sync work with ~17ms of async IPC wait.
    // Compute sync results eagerly; they'll be interleaved in the original merge
    // order below to preserve "last-key-wins" semantics.
    const tSync = perfStart()
    const autoLayoutProps = getAutoLayoutProps(node)
    const minMaxProps = getMinMaxProps(node)
    const layoutProps = getLayoutProps(node)
    const borderRadiusProps = getBorderRadiusProps(node)
    const blendProps = getBlendProps(node)
    const paddingProps = getPaddingProps(node)
    const textAlignProps = isText ? getTextAlignProps(node) : undefined
    const objectFitProps = getObjectFitProps(node)
    const maxLineProps = isText ? getMaxLineProps(node) : undefined
    const ellipsisProps = isText ? getEllipsisProps(node) : undefined
    const tEffect = perfStart()
    const effectProps = getEffectProps(node)
    perfEnd('getProps.effect', tEffect)
    const positionProps = getPositionProps(node)
    const gridChildProps = getGridChildProps(node)
    const transformProps = getTransformProps(node)
    const overflowProps = getOverflowProps(node)
    const tTextShadow = perfStart()
    const textShadowProps = isText ? getTextShadowProps(node) : undefined
    perfEnd('getProps.textShadow', tTextShadow)
    const cursorProps = getCursorProps(node)
    const visibilityProps = getVisibilityProps(node)
    perfEnd('getProps.sync', tSync)

    // PHASE 3: Await async results — likely already resolved during sync phase.
    const [borderProps, backgroundProps, textStrokeProps, reactionProps] =
      await Promise.all([
        borderP.then((r) => {
          perfEnd('getProps.border', tBorder)
          return r
        }),
        bgP.then((r) => {
          perfEnd('getProps.background', tBg)
          return r
        }),
        textStrokeP
          ? textStrokeP.then((r) => {
              perfEnd('getProps.textStroke', tTextStroke)
              return r
            })
          : undefined,
        reactionP.then((r) => {
          perfEnd('getProps.reaction', tReaction)
          return r
        }),
      ])

    // PHASE 4: Merge in the ORIGINAL interleaved order to preserve last-key-wins.
    // async results (border, background, effect, textStroke, textShadow, reaction)
    // are placed at their original positions relative to sync getters.
    return {
      ...autoLayoutProps,
      ...minMaxProps,
      ...layoutProps,
      ...borderRadiusProps,
      ...borderProps,
      ...backgroundProps,
      ...blendProps,
      ...paddingProps,
      ...textAlignProps,
      ...objectFitProps,
      ...maxLineProps,
      ...ellipsisProps,
      ...effectProps,
      ...positionProps,
      ...gridChildProps,
      ...transformProps,
      ...overflowProps,
      ...textStrokeProps,
      ...textShadowProps,
      ...reactionProps,
      ...cursorProps,
      ...visibilityProps,
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
