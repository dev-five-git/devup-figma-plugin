import { extractVariableName } from '../utils/extract-variable-name'
import { replaceAllVarFunctions } from '../utils/replace-all-var-functions'

export async function getBackgroundProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if ('fills' in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const css = await node.getCSSAsync()
    const bg = css.background || css.fill
    if (bg) {
      const resultBg = replaceAllVarFunctions(bg, extractVariableName)
      const gradientText =
        node.type === 'TEXT' &&
        node.fills.find((fill) => fill.type.includes('GRADIENT'))
      return {
        bg: resultBg.replace('<path-to-image>', '/icons/' + node.name + '.png'),
        color: gradientText ? 'transparent' : undefined,
        backgroundClip: gradientText ? 'text' : undefined,
      }
    }
  }
}
