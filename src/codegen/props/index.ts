import type { NodeContext } from '../types'
import { checkAssetNode } from '../utils/check-asset-node'
import { getPageNode } from '../utils/get-page-node'
import { isPageRoot } from '../utils/is-page-root'
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
import { canBeAbsolute, getPositionProps } from './position'
import { getReactionProps } from './reaction'
import { getTextAlignProps } from './text-align'
import { getTextShadowProps } from './text-shadow'
import { getTextStrokeProps } from './text-stroke'
import { getTransformProps } from './transform'
import { getVisibilityProps } from './visibility'

export function computeNodeContext(node: SceneNode): NodeContext {
  const asset = checkAssetNode(node)
  const pageNode = getPageNode(
    node as BaseNode & ChildrenMixin,
  ) as SceneNode | null
  const pageRoot = isPageRoot(node)
  return {
    isAsset: asset,
    canBeAbsolute: canBeAbsolute(node),
    isPageRoot: pageRoot,
    pageNode,
  }
}

// Cache getProps() results keyed by node.id to avoid redundant computation.
// Figma returns new JS wrapper objects for the same node on each property access,
// so object-reference keys don't work — node.id is the stable identifier.
// For a COMPONENT_SET with N variants, getProps() is called O(N²) without caching
// because getSelectorProps/getSelectorPropsForGroup call it on overlapping node sets.
const getPropsCache = new Map<string, Promise<Record<string, unknown>>>()
const getPropsResolved = new Map<string, Record<string, unknown>>()

export function resetGetPropsCache(): void {
  getPropsCache.clear()
  getPropsResolved.clear()
}

export async function getProps(
  node: SceneNode,
): Promise<Record<string, unknown>> {
  const cacheKey = node.id
  if (cacheKey) {
    // Sync fast path: return raw reference from resolved cache (no clone needed —
    // all callers that need to merge selectorProps create their own objects now).
    const resolved = getPropsResolved.get(cacheKey)
    if (resolved) {
      perfEnd('getProps(cached)', perfStart())
      return resolved
    }
    const cached = getPropsCache.get(cacheKey)
    if (cached) {
      perfEnd('getProps(cached)', perfStart())
      return await cached
    }
  }

  const t = perfStart()
  const promise = (async () => {
    const isText = node.type === 'TEXT'

    // Compute cross-cutting node context ONCE for all sync getters that need it.
    const ctx = computeNodeContext(node)

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
    const autoLayoutProps = getAutoLayoutProps(node, ctx)
    const minMaxProps = getMinMaxProps(node)
    const layoutProps = getLayoutProps(node, ctx)
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
    const positionProps = getPositionProps(node, ctx)
    const gridChildProps = getGridChildProps(node)
    const transformProps = getTransformProps(node, ctx)
    const overflowProps = getOverflowProps(node)
    const tTextShadow = perfStart()
    const textShadowProps = isText ? getTextShadowProps(node) : undefined
    perfEnd('getProps.textShadow', tTextShadow)
    const cursorProps = getCursorProps(node)
    const visibilityProps = getVisibilityProps(node)
    perfEnd('getProps.sync', tSync)

    // PHASE 3: Await async results — likely already resolved during sync phase.
    // Sequential await: all 4 promises are already in-flight, so this just
    // picks up resolved values in order without Promise.all + .then() overhead.
    const borderProps = await borderP
    perfEnd('getProps.border', tBorder)
    const backgroundProps = await bgP
    perfEnd('getProps.background', tBg)
    const textStrokeProps = textStrokeP ? await textStrokeP : undefined
    if (textStrokeP) perfEnd('getProps.textStroke', tTextStroke)
    const reactionProps = await reactionP
    perfEnd('getProps.reaction', tReaction)

    // PHASE 4: Merge in the ORIGINAL interleaved order to preserve last-key-wins.
    // async results (border, background, effect, textStroke, textShadow, reaction)
    // are placed at their original positions relative to sync getters.
    const result: Record<string, unknown> = {}
    Object.assign(
      result,
      autoLayoutProps,
      minMaxProps,
      layoutProps,
      borderRadiusProps,
    )
    Object.assign(
      result,
      borderProps,
      backgroundProps,
      blendProps,
      paddingProps,
    )
    if (textAlignProps) Object.assign(result, textAlignProps)
    Object.assign(result, objectFitProps)
    if (maxLineProps) Object.assign(result, maxLineProps)
    if (ellipsisProps) Object.assign(result, ellipsisProps)
    Object.assign(
      result,
      effectProps,
      positionProps,
      gridChildProps,
      transformProps,
    )
    Object.assign(result, overflowProps)
    if (textStrokeProps) Object.assign(result, textStrokeProps)
    if (textShadowProps) Object.assign(result, textShadowProps)
    Object.assign(result, reactionProps, cursorProps, visibilityProps)
    return result
  })()

  if (cacheKey) {
    getPropsCache.set(cacheKey, promise)
  }
  const result = await promise
  if (cacheKey) {
    getPropsResolved.set(cacheKey, result)
  }
  perfEnd('getProps()', t)
  return result
}
