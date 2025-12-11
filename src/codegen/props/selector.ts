import { fmtPct } from '../utils/fmtPct'
import { getProps } from '.'

export async function getSelectorProps(
  node: ComponentSetNode | ComponentNode,
): Promise<
  | {
      props: Record<string, object | string>
      variants: Record<string, string>
    }
  | undefined
> {
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
    const transition = node.defaultVariant.reactions
      .flatMap(
        (reaction) =>
          reaction.actions?.find((action) => action.type === 'NODE')
            ?.transition,
      )
      .flat()[0]
    const diffKeys = new Set<string>()
    for (const [effect, props] of components) {
      if (!effect) continue
      const def = difference(props, defaultProps)
      if (Object.keys(def).length === 0) continue
      result.props[`_${effect}`] = def
      for (const key of Object.keys(def)) {
        diffKeys.add(key)
      }
    }
    if (transition?.type === 'SMART_ANIMATE' && diffKeys.size > 0) {
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
