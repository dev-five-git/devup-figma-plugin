import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { addPx } from '../utils/add-px'

export async function getTextShadowProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if (node.type !== 'TEXT') return

  const effects = node.effects.filter((effect) => effect.visible)
  if (effects.length === 0) return
  const dropShadows = effects.filter((effect) => effect.type === 'DROP_SHADOW')
  if (dropShadows.length === 0) return
  return {
    textShadow: dropShadows
      .map(
        (dropShadow) =>
          `${addPx(dropShadow.offset.x, '0')} ${addPx(dropShadow.offset.y, '0')} ${addPx(dropShadow.radius, '0')} ${optimizeHex(rgbaToHex(dropShadow.color))}`,
      )
      .join(', '),
  }
}
