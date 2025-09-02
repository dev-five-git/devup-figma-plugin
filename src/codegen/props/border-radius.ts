import { addPx } from '../utils/add-px'
import { fourValueShortcut } from '../utils/four-value-shortcut'

export function getBorderRadiusProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> {
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
    if (value === '0') return {}
    return {
      borderRadius: value,
    }
  }
  return {}
}
