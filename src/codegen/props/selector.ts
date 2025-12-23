import { fmtPct } from '../utils/fmtPct'
import { getProps } from '.'

// 속성 이름을 유효한 TypeScript 식별자로 변환
const toUpperCase = (_: string, chr: string) => chr.toUpperCase()

function sanitizePropertyName(name: string): string {
  // 1. 공백과 특수문자를 처리하여 camelCase로 변환
  const result = name
    .trim()
    // 공백이나 특수문자 뒤의 문자를 대문자로 (camelCase 변환)
    .replace(/[\s\-_]+(.)/g, toUpperCase)
    // 숫자로 시작하면 앞에 _ 추가
    .replace(/^(\d)/, '_$1')

  // 2. 유효하지 않은 문자 제거 (한글, 특수문자 등)
  const cleaned = result.replace(/[^\w$]/g, '')

  // 3. 완전히 비어있거나 숫자로만 구성된 경우 기본값 사용
  if (!cleaned || /^\d+$/.test(cleaned)) {
    return 'variant'
  }

  return cleaned
}

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
        const sanitizedName = sanitizePropertyName(name)
        // variant 옵션값들을 문자열 리터럴로 감싸기
        acc.variants[sanitizedName] =
          definition.variantOptions
            ?.map((option) => `'${option}'`)
            .join(' | ') || ''
      }
      return acc
    },
    {
      props: {} as Record<string, object | string>,
      variants: {} as Record<string, string>,
    },
  )

  if (components.length > 0) {
    const findNodeAction = (action: Action) => action.type === 'NODE'
    const getTransition = (reaction: Reaction) =>
      reaction.actions?.find(findNodeAction)?.transition
    const transition = node.defaultVariant.reactions
      .flatMap(getTransition)
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
