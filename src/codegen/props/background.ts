import { checkAssetNode } from '../utils/check-asset-node'
import { extractVariableName } from '../utils/extract-variable-name'
import { replaceAllVarFunctions } from '../utils/replace-all-var-functions'

export async function getBackgroundProps(
  node: SceneNode,
): Promise<
  Record<string, boolean | string | number | undefined | null> | undefined
> {
  if (
    'fills' in node &&
    Array.isArray(node.fills) &&
    node.fills.length > 0 &&
    !checkAssetNode(node)
  ) {
    const css = await node.getCSSAsync()
    const bg = css.background || css.fill
    if (bg) {
      const resultBg = replaceAllVarFunctions(bg, extractVariableName)
      return {
        bg: resultBg.replace('<path-to-image>', '/icons/' + node.name + '.png'),
      }
    }
  }
}
