import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { addPx } from '../utils/add-px'

export async function getEffectProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if ('effects' in node && node.effects.length > 0) {
    return node.effects.reduce((acc, effect) => {
      return {
        ...acc,
        ..._getEffectPropsFromEffect(effect),
      }
    }, {})
  }
}

function _getEffectPropsFromEffect(effect: Effect): Record<string, string> {
  switch (effect.type) {
    case 'DROP_SHADOW': {
      const shadow = effect as DropShadowEffect
      const offsetX = shadow.offset.x
      const offsetY = shadow.offset.y
      const blur = shadow.radius
      const spread = shadow.spread || 0
      const color = shadow.color

      return {
        boxShadow: `${addPx(offsetX, '0')} ${addPx(offsetY, '0')} ${addPx(blur, '0')} ${addPx(spread, '0')} ${optimizeHex(rgbaToHex(color))})`,
      }
    }
    case 'INNER_SHADOW': {
      const shadow = effect as InnerShadowEffect
      const offsetX = shadow.offset.x
      const offsetY = shadow.offset.y
      const blur = shadow.radius
      const spread = shadow.spread || 0
      const color = shadow.color

      return {
        boxShadow: `inset ${addPx(offsetX, '0')} ${addPx(offsetY, '0')} ${addPx(blur, '0')} ${addPx(spread, '0')} ${optimizeHex(rgbaToHex(color))}`,
      }
    }
    case 'LAYER_BLUR': {
      return {
        filter: `blur(${effect.radius}px)`,
      }
    }
    case 'BACKGROUND_BLUR': {
      return {
        backdropFilter: `blur(${effect.radius}px)`,
        WebkitBackdropFilter: `blur(${effect.radius}px)`,
      }
    }
    case 'NOISE': {
      return {
        filter: `contrast(100%) brightness(100%)`,
      }
    }
    case 'TEXTURE': {
      return {
        filter: `contrast(100%) brightness(100%)`,
      }
    }
    case 'GLASS': {
      return {
        backdropFilter: `blur(${effect.radius}px)`,
        WebkitBackdropFilter: `blur(${effect.radius}px)`,
      }
    }
    default:
      return {}
  }
}
