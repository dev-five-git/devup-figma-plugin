import { addPx } from '../utils/add-px'
import { extractVariableName } from '../utils/extract-variable-name'
import { fourValueShortcut } from '../utils/four-value-shortcut'
import { replaceAllVarFunctions } from '../utils/replace-all-var-functions'

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
  if (
    !(
      'strokes' in node &&
      node.strokes.length > 0 &&
      typeof node.strokeWeight === 'number' &&
      node.strokeWeight > 0
    )
  )
    return
  const css = await node.getCSSAsync()
  if (node.strokeAlign !== 'INSIDE') {
    const outline =
      'border' in css
        ? css.border
        : `solid ${node.strokeWeight}px ${css.background}`
    return {
      outline: outline
        ? replaceAllVarFunctions(outline, extractVariableName)
        : undefined,
      outlineOffset: {
        CENTER: addPx(-node.strokeWeight / 2),
        OUTSIDE: null,
      }[node.strokeAlign],
    }
  }
  const border =
    'border' in css
      ? css.border
      : `solid ${node.strokeWeight}px ${css.background}`
  return {
    border: border
      ? replaceAllVarFunctions(border, extractVariableName)
      : undefined,
    borderBottom: css['border-bottom']
      ? replaceAllVarFunctions(css['border-bottom'], extractVariableName)
      : undefined,
    borderTop: css['border-top']
      ? replaceAllVarFunctions(css['border-top'], extractVariableName)
      : undefined,
    borderLeft: css['border-left']
      ? replaceAllVarFunctions(css['border-left'], extractVariableName)
      : undefined,
    borderRight: css['border-right']
      ? replaceAllVarFunctions(css['border-right'], extractVariableName)
      : undefined,
  }
}
