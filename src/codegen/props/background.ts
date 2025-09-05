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
    !node.isAsset
  ) {
    const css = await node.getCSSAsync()
    return {
      bg: css.background
        ? replaceAllVarFunctions(css.background, extractVariableName)
        : undefined,
    }
  }
}
