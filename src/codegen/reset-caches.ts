import { resetTextStyleCache } from '../utils'
import { resetGlobalBuildTreeCache, resetMainComponentCache } from './Codegen'
import { resetGetPropsCache } from './props'
import { resetChildAnimationCache } from './props/reaction'
import { resetSelectorPropsCache } from './props/selector'
import { resetCheckAssetNodeCache } from './utils/check-asset-node'
import { resetCheckSameColorCache } from './utils/check-same-color'
import { resetComponentPropertyDefinitionsCache } from './utils/get-component-property-definitions'
import { resetGetPageNodeCache } from './utils/get-page-node'
import { resetPaintToCssCache } from './utils/paint-to-css'
import { resetVariableCache } from './utils/variable-cache'

/**
 * Clear every memoization cache the codegen pipeline keeps between runs.
 *
 * All of these caches are keyed by `node.id`, so a stale entry from a previous
 * run silently changes the output of the next one. A codegen run must therefore
 * start from a clean slate — and so must every test that drives codegen, or the
 * result depends on which test happened to run first.
 */
export function resetCodegenCaches(): void {
  resetGetPropsCache()
  resetSelectorPropsCache()
  resetChildAnimationCache()
  resetVariableCache()
  resetCheckAssetNodeCache()
  resetCheckSameColorCache()
  resetPaintToCssCache()
  resetGetPageNodeCache()
  resetComponentPropertyDefinitionsCache()
  resetTextStyleCache()
  resetMainComponentCache()
  resetGlobalBuildTreeCache()
}
