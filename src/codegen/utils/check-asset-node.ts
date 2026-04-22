import { solidToString, solidToStringSync } from './solid-to-string'

const checkAssetNodeCache = new Map<string, 'svg' | 'png' | null>()
const assetAnalysisCache = new Map<string, Promise<AssetAnalysis>>()

interface AssetAnalysis {
  assetType: 'svg' | 'png' | null
  sameColor: null | string | false
}

type OwnColorAnalysis =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  | { kind: 'false' }
  | { kind: 'null' }

export function resetCheckAssetNodeCache(): void {
  checkAssetNodeCache.clear()
  assetAnalysisCache.clear()
}

function hasSmartAnimateReaction(node: BaseNode | null): boolean {
  if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') return false
  if (
    'reactions' in node &&
    node.reactions?.some((reaction) =>
      reaction.actions?.some(
        (action) =>
          action.type === 'NODE' && action.transition?.type === 'SMART_ANIMATE',
      ),
    )
  )
    return true
  return false
}

function isAnimationTarget(node: SceneNode): boolean {
  // Check if node itself has SMART_ANIMATE
  if (hasSmartAnimateReaction(node)) return true
  // Check if parent has SMART_ANIMATE (node is animation target as child)
  if (node.parent && hasSmartAnimateReaction(node.parent)) return true
  return false
}

export function checkAssetNode(
  node: SceneNode,
  nested = false,
): 'svg' | 'png' | null {
  const cacheKey = node.id ? `${node.id}:${nested ? '1' : '0'}` : null
  if (cacheKey && checkAssetNodeCache.has(cacheKey)) {
    return checkAssetNodeCache.get(cacheKey) ?? null
  }

  const result = computeAssetNode(node, nested)
  if (cacheKey) {
    checkAssetNodeCache.set(cacheKey, result)
  }
  return result
}

export async function analyzeAssetNode(
  node: SceneNode,
  nested = false,
): Promise<AssetAnalysis> {
  const cacheKey = node.id ? `${node.id}:${nested ? '1' : '0'}` : null
  if (cacheKey) {
    const cached = assetAnalysisCache.get(cacheKey)
    if (cached) return cached
  }

  const promise = computeAssetAnalysis(node, nested)
  if (cacheKey) {
    assetAnalysisCache.set(cacheKey, promise)
  }
  return await promise
}

function mergeSameColor(
  current: null | string | false,
  next: null | string | false,
): null | string | false {
  if (next === false) return false
  if (current === null) return next
  if (current !== next) return false
  return current
}

async function analyzeOwnSameColor(node: SceneNode): Promise<OwnColorAnalysis> {
  let targetColor: string | null = null
  let hasPaints = false

  const paintArrays: Paint[][] = []
  if ('fills' in node && Array.isArray(node.fills)) paintArrays.push(node.fills)
  if ('strokes' in node && Array.isArray(node.strokes))
    paintArrays.push(node.strokes)

  for (const paints of paintArrays) {
    for (const paint of paints) {
      if (!paint.visible) continue
      hasPaints = true
      if (paint.type !== 'SOLID') return { kind: 'null' }

      const syncColor = solidToStringSync(paint)
      const resolvedColor = syncColor ?? (await solidToString(paint))
      if (targetColor === null) targetColor = resolvedColor
      else if (targetColor !== resolvedColor) return { kind: 'false' }
    }
  }

  if (!hasPaints) return { kind: 'none' }
  if (targetColor === null) return { kind: 'null' }
  return { kind: 'color', color: targetColor }
}

async function computeAssetAnalysis(
  node: SceneNode,
  nested = false,
): Promise<AssetAnalysis> {
  if (
    node.type === 'TEXT' ||
    node.type === 'COMPONENT_SET' ||
    ('inferredAutoLayout' in node &&
      node.inferredAutoLayout?.layoutMode === 'GRID')
  ) {
    return { assetType: null, sameColor: null }
  }

  if (isAnimationTarget(node)) {
    return { assetType: null, sameColor: null }
  }

  if (['VECTOR', 'STAR', 'POLYGON'].includes(node.type)) {
    const ownColor = await analyzeOwnSameColor(node)
    return {
      assetType: 'svg',
      sameColor: ownColor.kind === 'color' ? ownColor.color : null,
    }
  }

  if (node.type === 'ELLIPSE' && node.arcData.innerRadius) {
    const ownColor = await analyzeOwnSameColor(node)
    return {
      assetType: 'svg',
      sameColor: ownColor.kind === 'color' ? ownColor.color : null,
    }
  }

  if (!('children' in node) || node.children.length === 0) {
    if (
      'fills' in node &&
      Array.isArray(node.fills) &&
      node.fills.find(
        (fill: Paint) =>
          fill.visible !== false &&
          (fill.type === 'PATTERN' ||
            (fill.type === 'IMAGE' && fill.scaleMode === 'TILE')),
      )
    ) {
      return { assetType: null, sameColor: null }
    }

    if (node.isAsset) {
      if ('fills' in node && Array.isArray(node.fills)) {
        const hasImageFill = node.fills.some(
          (fill: Paint) =>
            fill.visible !== false &&
            fill.type === 'IMAGE' &&
            fill.scaleMode !== 'TILE',
        )
        if (hasImageFill) {
          return {
            assetType: node.fills.length === 1 ? 'png' : null,
            sameColor: null,
          }
        }

        const allVisibleSolid = node.fills.every(
          (fill: Paint) => fill.visible && fill.type === 'SOLID',
        )
        if (allVisibleSolid) {
          const ownColor = await analyzeOwnSameColor(node)
          return nested
            ? {
                assetType: 'svg',
                sameColor: ownColor.kind === 'color' ? ownColor.color : null,
              }
            : { assetType: null, sameColor: null }
        }

        const ownColor = await analyzeOwnSameColor(node)
        return {
          assetType: 'svg',
          sameColor:
            ownColor.kind === 'color'
              ? ownColor.color
              : ownColor.kind === 'false'
                ? false
                : null,
        }
      }

      return { assetType: null, sameColor: null }
    }

    if (
      nested &&
      'fills' in node &&
      Array.isArray(node.fills) &&
      !node.fills.some(
        (fill: Paint) =>
          fill.visible !== false &&
          (fill.type === 'IMAGE' ||
            fill.type === 'VIDEO' ||
            fill.type === 'PATTERN'),
      )
    ) {
      const ownColor = await analyzeOwnSameColor(node)
      return {
        assetType: 'svg',
        sameColor: ownColor.kind === 'color' ? ownColor.color : null,
      }
    }

    return { assetType: null, sameColor: null }
  }

  const { children } = node
  if (children.length === 1) {
    if (
      ('paddingLeft' in node &&
        (node.paddingLeft > 0 ||
          node.paddingRight > 0 ||
          node.paddingTop > 0 ||
          node.paddingBottom > 0)) ||
      ('fills' in node &&
        (Array.isArray(node.fills)
          ? node.fills.find((fill) => fill.visible !== false)
          : true))
    ) {
      return { assetType: null, sameColor: null }
    }

    return await analyzeAssetNode(children[0], true)
  }

  const filteredChildren = children.filter((child) => child.visible)
  const ownColor = await analyzeOwnSameColor(node)
  if (ownColor.kind === 'null') {
    for (const child of filteredChildren) {
      const childAnalysis = await analyzeAssetNode(child, true)
      if (childAnalysis.assetType !== 'svg') {
        return { assetType: null, sameColor: null }
      }
    }
    return { assetType: 'svg', sameColor: null }
  }

  if (ownColor.kind === 'false') {
    for (const child of filteredChildren) {
      const childAnalysis = await analyzeAssetNode(child, true)
      if (childAnalysis.assetType !== 'svg') {
        return { assetType: null, sameColor: null }
      }
    }
    return { assetType: 'svg', sameColor: false }
  }

  let sameColor: null | string | false =
    ownColor.kind === 'color' ? ownColor.color : null

  for (const child of filteredChildren) {
    const childAnalysis = await analyzeAssetNode(child, true)
    if (childAnalysis.assetType !== 'svg') {
      return { assetType: null, sameColor: null }
    }
    sameColor = mergeSameColor(sameColor, childAnalysis.sameColor)
  }

  return {
    assetType: 'svg',
    sameColor,
  }
}

function computeAssetNode(
  node: SceneNode,
  nested = false,
): 'svg' | 'png' | null {
  if (
    node.type === 'TEXT' ||
    node.type === 'COMPONENT_SET' ||
    ('inferredAutoLayout' in node &&
      node.inferredAutoLayout?.layoutMode === 'GRID')
  )
    return null
  // if node is an animation target (has keyframes), it should not be treated as an asset
  if (isAnimationTarget(node)) return null
  // vector must be svg
  if (['VECTOR', 'STAR', 'POLYGON'].includes(node.type)) return 'svg'
  // ellipse with inner radius must be svg
  if (node.type === 'ELLIPSE' && node.arcData.innerRadius) return 'svg'
  if (!('children' in node) || node.children.length === 0) {
    if (
      'fills' in node &&
      Array.isArray(node.fills) &&
      // if node has tile, it is not an Image, it just has a tile background
      node.fills.find(
        (fill: Paint) =>
          fill.visible !== false &&
          (fill.type === 'PATTERN' ||
            (fill.type === 'IMAGE' && fill.scaleMode === 'TILE')),
      )
    )
      return null
    return node.isAsset
      ? 'fills' in node && Array.isArray(node.fills)
        ? node.fills.some(
            (fill: Paint) =>
              fill.visible !== false &&
              fill.type === 'IMAGE' &&
              fill.scaleMode !== 'TILE',
          )
          ? node.fills.length === 1
            ? 'png'
            : null
          : node.fills.every(
                (fill: Paint) => fill.visible && fill.type === 'SOLID',
              )
            ? nested
              ? 'svg'
              : null
            : 'svg'
        : null
      : nested &&
          'fills' in node &&
          Array.isArray(node.fills) &&
          !node.fills.some(
            (fill: Paint) =>
              fill.visible !== false &&
              (fill.type === 'IMAGE' ||
                fill.type === 'VIDEO' ||
                fill.type === 'PATTERN'),
          )
        ? 'svg'
        : null
  }
  const { children } = node
  if (children.length === 1) {
    if (
      ('paddingLeft' in node &&
        (node.paddingLeft > 0 ||
          node.paddingRight > 0 ||
          node.paddingTop > 0 ||
          node.paddingBottom > 0)) ||
      ('fills' in node &&
        (Array.isArray(node.fills)
          ? node.fills.find((fill) => fill.visible !== false)
          : true))
    )
      return null
    return checkAssetNode(children[0], true)
  }
  const filteredChildren = children.filter((child) => child.visible)

  return filteredChildren.every((child) => {
    const result = checkAssetNode(child, true)
    if (result === null) return false
    return result === 'svg'
  })
    ? 'svg'
    : null
}
