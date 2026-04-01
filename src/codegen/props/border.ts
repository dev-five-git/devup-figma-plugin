import { addPx } from '../utils/add-px'
import { fourValueShortcut } from '../utils/four-value-shortcut'
import { paintToCSS, paintToCSSSyncIfPossible } from '../utils/paint-to-css'
import { resolveBoundVariable } from '../utils/resolve-bound-variable'

type BoundVars = Record<string, { id: string } | undefined> | undefined | null

export async function getBorderRadiusProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  const bv =
    'boundVariables' in node ? (node.boundVariables as BoundVars) : undefined

  if (
    'cornerRadius' in node &&
    typeof node.cornerRadius === 'number' &&
    node.cornerRadius !== 0
  ) {
    const variable = await resolveBoundVariable(bv, 'cornerRadius')
    if (variable) return { borderRadius: variable }
    // No cornerRadius variable — check individual corners for variables.
    // Figma binds variables to topLeftRadius etc, not the cornerRadius shorthand.
    // If individual corners aren't set, use the raw cornerRadius value.
    if (!('topLeftRadius' in node)) {
      return { borderRadius: addPx(node.cornerRadius) }
    }
  }
  if ('topLeftRadius' in node) {
    const [vtl, vtr, vbr, vbl] = await Promise.all([
      resolveBoundVariable(bv, 'topLeftRadius'),
      resolveBoundVariable(bv, 'topRightRadius'),
      resolveBoundVariable(bv, 'bottomRightRadius'),
      resolveBoundVariable(bv, 'bottomLeftRadius'),
    ])

    if (vtl || vtr || vbr || vbl) {
      // At least one corner has a variable — resolve all with fallback
      const tl = vtl ?? addPx(node.topLeftRadius, '0')
      const tr = vtr ?? addPx(node.topRightRadius, '0')
      const br = vbr ?? addPx(node.bottomRightRadius, '0')
      const bl = vbl ?? addPx(node.bottomLeftRadius, '0')

      // Apply same CSS shorthand optimization as fourValueShortcut
      if (tl === tr && tr === br && br === bl) {
        return { borderRadius: tl }
      }
      if (tl === br && tr === bl) return { borderRadius: `${tl} ${tr}` }
      if (tr === bl) return { borderRadius: `${tl} ${tr} ${br}` }
      return { borderRadius: `${tl} ${tr} ${br} ${bl}` }
    }

    // No variables — use existing sync path
    const value = fourValueShortcut(
      node.topLeftRadius,
      node.topRightRadius,
      node.bottomRightRadius,
      node.bottomLeftRadius,
    )
    if (value === '0') return
    return {
      borderRadius: value,
    }
  }
  if (node.type === 'ELLIPSE' && !node.arcData.innerRadius) {
    return {
      borderRadius: '50%',
    }
  }
}

export async function getBorderProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if (!('strokes' in node && node.strokes.length > 0) || node.type === 'TEXT')
    return
  const strokeStyle = getStrokeStyle(node)
  const paintCssList = []
  for (let i = 0; i < node.strokes.length; i++) {
    const paint = node.strokes[node.strokes.length - 1 - i]
    if (paint.visible !== false && paint.opacity !== 0) {
      paintCssList.push(
        paintToCSSSyncIfPossible(paint, node, i === node.strokes.length - 1) ??
          (await paintToCSS(paint, node, i === node.strokes.length - 1)),
      )
    }
  }
  const weight = node.strokeWeight
  if (
    weight !== figma.mixed &&
    (node.strokeAlign !== 'INSIDE' || node.type === 'LINE')
  ) {
    const outline = paintCssList
      .map((css) => `${strokeStyle} ${weight}px ${css}`)
      .join(', ')
    const wType =
      'layoutSizingHorizontal' in node ? node.layoutSizingHorizontal : 'FILL'
    return {
      outline,
      outlineOffset:
        node.type === 'LINE'
          ? null
          : {
              CENTER: addPx(-weight / 2),
              OUTSIDE: null,
              INSIDE: null,
            }[node.strokeAlign],
      maxW:
        node.type === 'LINE'
          ? `calc(${wType === 'FILL' ? '100%' : `${node.width}px`} - ${weight * 2}px)`
          : undefined,
      transform:
        node.type === 'LINE'
          ? `translate(${addPx(weight)}, ${addPx(-weight)})`
          : undefined,
    }
  }
  if (weight !== figma.mixed) {
    return {
      border: paintCssList
        .map((css) => `${strokeStyle} ${weight}px ${css}`)
        .join(', '),
    }
  }
  const n = node as IndividualStrokesMixin

  return {
    borderBottom: n.strokeBottomWeight
      ? paintCssList
          .map((css) => `${strokeStyle} ${n.strokeBottomWeight}px ${css}`)
          .join(', ')
      : undefined,
    borderTop: n.strokeTopWeight
      ? paintCssList
          .map((css) => `${strokeStyle} ${n.strokeTopWeight}px ${css}`)
          .join(', ')
      : undefined,
    borderLeft: n.strokeLeftWeight
      ? paintCssList
          .map((css) => `${strokeStyle} ${n.strokeLeftWeight}px ${css}`)
          .join(', ')
      : undefined,
    borderRight: n.strokeRightWeight
      ? paintCssList
          .map((css) => `${strokeStyle} ${n.strokeRightWeight}px ${css}`)
          .join(', ')
      : undefined,
  }
}

function getStrokeStyle(node: SceneNode): 'solid' | 'dashed' {
  if ('dashPattern' in node && Array.isArray(node.dashPattern)) {
    return node.dashPattern.length > 0 ? 'dashed' : 'solid'
  }
  return 'solid'
}
