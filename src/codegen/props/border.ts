import { addPx } from '../utils/add-px'
import { fourValueShortcut } from '../utils/four-value-shortcut'
import { paintToCSS } from '../utils/paint-to-css'

export function getBorderRadiusProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (
    'cornerRadius' in node &&
    typeof node.cornerRadius === 'number' &&
    node.cornerRadius !== 0
  )
    return {
      borderRadius: addPx(node.cornerRadius),
    }
  if ('topLeftRadius' in node) {
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
  const paintCssList = []
  for (let i = 0; i < node.strokes.length; i++) {
    const paint = node.strokes[node.strokes.length - 1 - i]
    if (paint.visible && paint.opacity !== 0) {
      paintCssList.push(
        await paintToCSS(paint, node, i === node.strokes.length - 1),
      )
    }
  }
  const weight = node.strokeWeight
  if (
    weight !== figma.mixed &&
    (node.strokeAlign !== 'INSIDE' || node.type === 'LINE')
  ) {
    const outline = paintCssList
      .map((css) => `solid ${weight}px ${css}`)
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
      border: paintCssList.map((css) => `solid ${weight}px ${css}`).join(', '),
    }
  }
  const n = node as IndividualStrokesMixin

  return {
    borderBottom: n.strokeBottomWeight
      ? paintCssList
          .map((css) => `solid ${n.strokeBottomWeight}px ${css}`)
          .join(', ')
      : undefined,
    borderTop: n.strokeTopWeight
      ? paintCssList
          .map((css) => `solid ${n.strokeTopWeight}px ${css}`)
          .join(', ')
      : undefined,
    borderLeft: n.strokeLeftWeight
      ? paintCssList
          .map((css) => `solid ${n.strokeLeftWeight}px ${css}`)
          .join(', ')
      : undefined,
    borderRight: n.strokeRightWeight
      ? paintCssList
          .map((css) => `solid ${n.strokeRightWeight}px ${css}`)
          .join(', ')
      : undefined,
  }
}
