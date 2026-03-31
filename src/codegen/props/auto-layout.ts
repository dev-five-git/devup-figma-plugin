import type { NodeContext } from '../types'
import { addPx } from '../utils/add-px'
import { checkAssetNode } from '../utils/check-asset-node'
import { resolveBoundVariable } from '../utils/resolve-bound-variable'

export async function getAutoLayoutProps(
  node: SceneNode,
  ctx?: NodeContext,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if (
    !('inferredAutoLayout' in node) ||
    !node.inferredAutoLayout ||
    node.inferredAutoLayout.layoutMode === 'NONE' ||
    (ctx ? ctx.isAsset !== null : !!checkAssetNode(node))
  )
    return
  const { layoutMode } = node.inferredAutoLayout
  if (layoutMode === 'GRID') return getGridProps(node)

  const bv =
    'boundVariables' in node
      ? (node.boundVariables as
          | Record<string, { id: string } | undefined>
          | undefined)
      : undefined

  let childrenCount = 0
  for (const c of node.children) if (c.visible) childrenCount++

  const gapValue =
    childrenCount > 1 && node.primaryAxisAlignItems !== 'SPACE_BETWEEN'
      ? ((await resolveBoundVariable(bv, 'itemSpacing')) ??
        addPx(node.inferredAutoLayout.itemSpacing))
      : undefined

  return {
    display: {
      HORIZONTAL: 'flex',
      VERTICAL: 'flex',
    }[layoutMode],
    flexDir: {
      HORIZONTAL: 'row',
      VERTICAL: 'column',
    }[layoutMode],
    gap: gapValue,
    justifyContent: getJustifyContent(node),
    alignItems: getAlignItems(node),
  }
}

function getJustifyContent(
  node: SceneNode & BaseFrameMixin,
): string | undefined {
  return {
    MIN: 'flex-start',
    MAX: 'flex-end',
    CENTER: 'center',
    SPACE_BETWEEN: 'space-between',
  }[node.primaryAxisAlignItems]
}

function getAlignItems(node: SceneNode & BaseFrameMixin): string | undefined {
  return {
    MIN: 'flex-start',
    MAX: 'flex-end',
    CENTER: 'center',
    SPACE_BETWEEN: 'space-between',
    BASELINE: 'baseline',
  }[node.counterAxisAlignItems]
}

async function getGridProps(
  node: GridLayoutMixin,
): Promise<Record<string, boolean | undefined | string | number | null>> {
  const bv =
    'boundVariables' in node
      ? ((node as unknown as Record<string, unknown>).boundVariables as
          | Record<string, { id: string } | undefined>
          | undefined)
      : undefined

  // Round to 2 decimal places to handle Figma floating-point imprecision
  const sameGap =
    Math.round(node.gridRowGap * 100) / 100 ===
    Math.round(node.gridColumnGap * 100) / 100

  const rowGapVar = await resolveBoundVariable(bv, 'gridRowGap')
  const colGapVar = await resolveBoundVariable(bv, 'gridColumnGap')

  // When variables are involved, check string equality for shorthand
  const rowGapVal = rowGapVar ?? addPx(node.gridRowGap)
  const colGapVal = colGapVar ?? addPx(node.gridColumnGap)
  const hasVars = !!(rowGapVar || colGapVar)
  const canUseGapShorthand = hasVars ? rowGapVal === colGapVal : sameGap

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${node.gridColumnCount}, 1fr)`,
    gridTemplateRows: `repeat(${node.gridRowCount}, 1fr)`,
    rowGap: canUseGapShorthand ? undefined : rowGapVal,
    columnGap: canUseGapShorthand ? undefined : colGapVal,
    gap: canUseGapShorthand ? rowGapVal : undefined,
  }
}
