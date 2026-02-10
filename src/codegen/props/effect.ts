import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { addPx } from '../utils/add-px'

export function getEffectProps(
  node: SceneNode,
): Record<string, string> | undefined {
  if ('effects' in node && node.effects.length > 0) {
    return node.effects.reduce(
      (acc, effect) => {
        const props = _getEffectPropsFromEffect(effect)
        for (const [key, value] of Object.entries(props)) {
          if (value) {
            if (acc[key]) {
              acc[key] = `${acc[key]}, ${value}`
            } else {
              acc[key] = value
            }
          }
        }
        return acc
      },
      {} as Record<string, string>,
    )
  }
}

function _getEffectPropsFromEffect(effect: Effect): Record<string, string> {
  switch (effect.type) {
    case 'DROP_SHADOW': {
      const { offset, radius, spread, color } = effect
      const { x, y } = offset

      return {
        boxShadow: `${addPx(x, '0')} ${addPx(y, '0')} ${addPx(radius, '0')} ${addPx(spread, '0')} ${optimizeHex(rgbaToHex(color))}`,
      }
    }
    case 'INNER_SHADOW': {
      const { offset, radius, spread, color } = effect
      const { x, y } = offset

      return {
        boxShadow: `inset ${addPx(x, '0')} ${addPx(y, '0')} ${addPx(radius, '0')} ${addPx(spread, '0')} ${optimizeHex(rgbaToHex(color))}`,
      }
    }
    case 'LAYER_BLUR':
      return {
        filter: `blur(${effect.radius}px)`,
      }

    case 'BACKGROUND_BLUR':
      return {
        backdropFilter: `blur(${effect.radius}px)`,
      }

    case 'NOISE':
      return {
        filter: `contrast(100%) brightness(100%)`,
      }

    case 'TEXTURE':
      return {
        filter: `contrast(100%) brightness(100%)`,
      }
    case 'GLASS':
      return {
        backdropFilter: `blur(${effect.radius}px)`,
      }
  }
}
