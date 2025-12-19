import { fmtPct } from '../utils/fmtPct'
import { getProps } from '.'
import {
  extractTransitionFromReactions,
  generateKeyframesForEffects,
  isSmartAnimateTransition,
  type KeyframeAnimation,
} from './keyframe'

export interface SelectorPropsResult {
  props: Record<string, object | string>
  variants: Record<string, string>
  keyframes?: KeyframeAnimation[]
}

export async function getSelectorProps(
  node: ComponentSetNode | ComponentNode,
  options?: { useKeyframes?: boolean },
): Promise<SelectorPropsResult | undefined> {
  if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
    return getSelectorProps(node.parent)
  }
  if (node.type !== 'COMPONENT_SET') return
  const hasEffect = !!node.componentPropertyDefinitions.effect
  const components = await Promise.all(
    node.children
      .filter((child) => {
        return child.type === 'COMPONENT'
      })
      .map(
        async (component) =>
          [
            hasEffect
              ? component.variantProperties?.effect
              : triggerTypeToEffect(component.reactions[0]?.trigger?.type),
            await getProps(component),
          ] as const,
      ),
  )

  const defaultProps = await getProps(node.defaultVariant)

  const result = Object.entries(node.componentPropertyDefinitions).reduce(
    (acc, [name, definition]) => {
      if (name !== 'effect') {
        acc.variants[name] = definition.variantOptions?.join(' | ') || ''
      }
      return acc
    },
    {
      props: {} as Record<string, object | string>,
      variants: {} as Record<string, string>,
    },
  )

  if (components.length > 0) {
    const transition = extractTransitionFromReactions(node.defaultVariant.reactions)
    const diffKeys = new Set<string>()
    const effectPropsMap = new Map<string, Record<string, unknown>>()

    for (const [effect, props] of components) {
      if (!effect) continue
      const def = difference(props, defaultProps)
      if (Object.keys(def).length === 0) continue
      result.props[`_${effect}`] = def
      effectPropsMap.set(effect, def)
      for (const key of Object.keys(def)) {
        diffKeys.add(key)
      }
    }

    if (isSmartAnimateTransition(transition) && diffKeys.size > 0) {
      const useKeyframes = options?.useKeyframes ?? false

      if (useKeyframes) {
        // Generate keyframe animations
        const keyframes = generateKeyframesForEffects(
          defaultProps as Record<string, unknown>,
          effectPropsMap,
          transition,
          node.id,
        )
        return {
          ...result,
          keyframes,
        }
      }

      // Default: Generate CSS transitions
      const keys = Array.from(diffKeys)
      keys.sort()
      result.props.transition = `${fmtPct(transition.duration)}ms ${transition.easing.type.toLocaleLowerCase().replaceAll('_', '-')}`
      result.props.transitionProperty = keys.join(',')
    }
  }

  return result
}

function triggerTypeToEffect(triggerType: Trigger['type'] | undefined) {
  if (!triggerType) return undefined
  switch (triggerType) {
    case 'ON_HOVER':
      return 'hover'
    case 'ON_PRESS':
      return 'active'
  }
}

function difference(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.entries(a).reduce(
    (acc, [key, value]) => {
      if (b[key] !== value) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, unknown>,
  )
}
