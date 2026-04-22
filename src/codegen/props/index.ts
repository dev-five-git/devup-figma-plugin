import type { NodeBoundVariables, NodeContext } from '../types'
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
import { getReactionProps, hasReactionProps } from './reaction'
import { getTextAlignProps } from './text-align'
import { getTextShadowProps } from './text-shadow'
import { getTextStrokeProps } from './text-stroke'
import { getTransformProps } from './transform'
import { getVisibilityProps } from './visibility'

export function computeNodeContext(node: SceneNode): NodeContext {
  const asset = checkAssetNode(node)
  const boundVariables =
    'boundVariables' in node
      ? (node.boundVariables as NodeBoundVariables)
      : undefined
  const pageNode = getPageNode(
    node as BaseNode & ChildrenMixin,
  ) as SceneNode | null
  const pageRoot = isPageRoot(node)
  return {
    isAsset: asset,
    canBeAbsolute: canBeAbsolute(node),
    isPageRoot: pageRoot,
    pageNode,
    boundVariables,
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
    const hasFills = 'fills' in node && node.fills !== figma.mixed
    const hasStrokes = 'strokes' in node && node.strokes.length > 0
    const hasEffects = 'effects' in node && node.effects.length > 0
    const hasInferredAutoLayout =
      'inferredAutoLayout' in node && !!node.inferredAutoLayout
    const hasPadding = 'paddingLeft' in node
    const hasRadius =
      ('cornerRadius' in node && typeof node.cornerRadius === 'number') ||
      'topLeftRadius' in node ||
      (node.type === 'ELLIPSE' && !node.arcData.innerRadius)

    // PHASE 1: Fire ALL async prop getters — initiates Figma IPC calls immediately.
    // These return Promises that resolve when IPC completes.
    // Includes: border, background, text-stroke, reaction (original async)
    //           + padding, auto-layout, layout, min-max, border-radius,
    //             effect, text-shadow (newly async for variable support)
    const tBorder = perfStart()
    const borderP = hasStrokes && !isText ? getBorderProps(node) : undefined
    const tBg = perfStart()
    const bgP = hasFills ? getBackgroundProps(node) : undefined
    const tTextStroke = perfStart()
    const textStrokeP =
      isText && hasStrokes ? getTextStrokeProps(node) : undefined
    const tReaction = perfStart()
    const reactionP = hasReactionProps(node)
      ? getReactionProps(node)
      : undefined
    const tAutoLayout = perfStart()
    const autoLayoutP = hasInferredAutoLayout
      ? getAutoLayoutProps(node, ctx)
      : undefined
    const tMinMax = perfStart()
    const minMaxP = getMinMaxProps(node, ctx)
    const tLayout = perfStart()
    const layoutP = getLayoutProps(node, ctx)
    const tBorderRadius = perfStart()
    const borderRadiusP = hasRadius
      ? getBorderRadiusProps(node, ctx)
      : undefined
    const tPadding = perfStart()
    const paddingP =
      hasInferredAutoLayout || hasPadding
        ? getPaddingProps(node, ctx)
        : undefined
    const tEffect = perfStart()
    const effectP = hasEffects ? getEffectProps(node) : undefined
    const tTextShadow = perfStart()
    const textShadowP =
      isText && hasEffects ? getTextShadowProps(node) : undefined

    // PHASE 2: Run sync prop getters while async IPC is pending in background.
    const tSync = perfStart()
    const blendProps = getBlendProps(node)
    const textAlignProps = isText ? getTextAlignProps(node) : undefined
    const objectFitProps = getObjectFitProps(node)
    const maxLineProps = isText ? getMaxLineProps(node) : undefined
    const ellipsisProps = isText ? getEllipsisProps(node) : undefined
    const positionProps = getPositionProps(node, ctx)
    const gridChildProps = getGridChildProps(node)
    const transformProps = getTransformProps(node, ctx)
    const overflowProps = getOverflowProps(node)
    const cursorProps = getCursorProps(node)
    const visibilityProps = getVisibilityProps(node)
    perfEnd('getProps.sync', tSync)

    // PHASE 3: Await async results — likely already resolved during sync phase.
    const autoLayoutProps = autoLayoutP ? await autoLayoutP : undefined
    if (autoLayoutP) perfEnd('getProps.autoLayout', tAutoLayout)
    const minMaxProps = await minMaxP
    perfEnd('getProps.minMax', tMinMax)
    const layoutProps = await layoutP
    perfEnd('getProps.layout', tLayout)
    const borderRadiusProps = borderRadiusP ? await borderRadiusP : undefined
    if (borderRadiusP) perfEnd('getProps.borderRadius', tBorderRadius)
    const borderProps = borderP ? await borderP : undefined
    if (borderP) perfEnd('getProps.border', tBorder)
    const backgroundProps = bgP ? await bgP : undefined
    if (bgP) perfEnd('getProps.background', tBg)
    const paddingProps = paddingP ? await paddingP : undefined
    if (paddingP) perfEnd('getProps.padding', tPadding)
    const effectProps = effectP ? await effectP : undefined
    if (effectP) perfEnd('getProps.effect', tEffect)
    const textStrokeProps = textStrokeP ? await textStrokeP : undefined
    if (textStrokeP) perfEnd('getProps.textStroke', tTextStroke)
    const textShadowProps = textShadowP ? await textShadowP : undefined
    if (textShadowP) perfEnd('getProps.textShadow', tTextShadow)
    const reactionProps = reactionP ? await reactionP : undefined
    if (reactionP) perfEnd('getProps.reaction', tReaction)

    // PHASE 4: Merge in order to preserve last-key-wins semantics.
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
