import { fmtPct } from '../utils/fmtPct'
import { perfEnd, perfStart } from '../utils/perf'
import { getProps } from '.'

// Cache getSelectorProps() keyed by ComponentSetNode.id.
// Called from addComponentTree() for each component — but the result depends only on the parent set.
const selectorPropsCache = new Map<
  string,
  Promise<{
    props: Record<string, object | string>
    variants: Record<string, string>
  }>
>()

// Cache getSelectorPropsForGroup() keyed by "setId::filter::viewport".
const selectorPropsForGroupCache = new Map<
  string,
  Promise<Record<string, object | string>>
>()

export function resetSelectorPropsCache(): void {
  selectorPropsCache.clear()
  selectorPropsForGroupCache.clear()
}

// Shorthand prop names to CSS standard property names
const shortToCssProperty: Record<string, string> = {
  bg: 'background',
  w: 'width',
  h: 'height',
  p: 'padding',
  pt: 'padding-top',
  pr: 'padding-right',
  pb: 'padding-bottom',
  pl: 'padding-left',
  px: 'padding-inline',
  py: 'padding-block',
  m: 'margin',
  mt: 'margin-top',
  mr: 'margin-right',
  mb: 'margin-bottom',
  ml: 'margin-left',
  mx: 'margin-inline',
  my: 'margin-block',
  pos: 'position',
}

/**
 * Convert camelCase to kebab-case for CSS property names.
 */
function toKebabCase(str: string): string {
  return str.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)
}

/**
 * Convert shorthand prop names to CSS standard property names for transitionProperty.
 * Also converts camelCase to kebab-case (e.g., boxShadow -> box-shadow).
 */
function toTransitionPropertyName(key: string): string {
  const mapped = shortToCssProperty[key] || key
  return toKebabCase(mapped)
}

// 속성 이름을 유효한 TypeScript 식별자로 변환
const toUpperCase = (_: string, chr: string) => chr.toUpperCase()

export function sanitizePropertyName(name: string): string {
  // 0. Strip Figma's internal "#nodeId:uniqueId" suffix (e.g., "leftIcon#60:123" → "leftIcon")
  const stripped = name.replace(/#\d+:\d+$/, '')

  // 1. 한글 '속성'을 'property'로 변환 (공백 포함 처리: "속성1" → "property1")
  const normalized = stripped.trim().replace(/속성\s*/g, 'property') // 한글 '속성' + 뒤따르는 공백을 'property'로 변환

  // 2. 공백과 특수문자를 처리하여 camelCase로 변환
  const result = normalized
    // 공백이나 특수문자 뒤의 문자를 대문자로 (camelCase 변환)
    .replace(/[\s\-_]+(.)/g, toUpperCase)
    // 숫자로 시작하면 앞에 _ 추가
    .replace(/^(\d)/, '_$1')

  // 3. 유효하지 않은 문자 제거 (한글, 특수문자 등)
  const cleaned = result.replace(/[^\w$]/g, '')

  // 4. 완전히 비어있거나 숫자로만 구성된 경우 기본값 사용
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

  const cacheKey = node.id
  if (cacheKey) {
    const cached = selectorPropsCache.get(cacheKey)
    if (cached) return cached
  }

  const promise = computeSelectorProps(node)
  if (cacheKey) {
    selectorPropsCache.set(cacheKey, promise)
  }
  return promise
}

async function computeSelectorProps(node: ComponentSetNode): Promise<{
  props: Record<string, object | string>
  variants: Record<string, string>
}> {
  const hasEffect = !!node.componentPropertyDefinitions.effect
  const tSelector = perfStart()
  console.info(
    `[perf] getSelectorProps: processing ${node.children.length} children`,
  )
  // Pre-filter: only call expensive getProps() on children with non-default effects.
  // The effect/trigger check is a cheap property read — skip children that would be
  // discarded later anyway (effect === undefined or effect === 'default').
  const effectChildren: { component: SceneNode; effect: string }[] = []
  for (const child of node.children) {
    if (child.type !== 'COMPONENT') continue
    const effect = hasEffect
      ? (child as ComponentNode).variantProperties?.effect
      : triggerTypeToEffect(child.reactions?.[0]?.trigger?.type)
    if (effect && effect !== 'default') {
      effectChildren.push({ component: child, effect })
    }
  }
  const components: (readonly [string, Record<string, unknown>])[] = []
  for (const { component, effect } of effectChildren) {
    components.push([effect, await getProps(component)] as const)
  }
  perfEnd('getSelectorProps.getPropsAll()', tSelector)

  const defaultProps = await getProps(node.defaultVariant)

  const result = Object.entries(node.componentPropertyDefinitions).reduce(
    (acc, [name, definition]) => {
      if (name === 'effect' || name === 'viewport') return acc

      const sanitizedName = sanitizePropertyName(name)
      if (definition.type === 'VARIANT' && definition.variantOptions) {
        acc.variants[sanitizedName] = definition.variantOptions
          .map((option) => `'${option}'`)
          .join(' | ')
      } else if (definition.type === 'INSTANCE_SWAP') {
        acc.variants[sanitizedName] = 'React.ReactNode'
      } else if (definition.type === 'BOOLEAN') {
        acc.variants[sanitizedName] = 'boolean'
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
      const def = difference(props, defaultProps)
      if (Object.keys(def).length === 0) continue
      result.props[`_${effect}`] = def
      for (const key of Object.keys(def)) {
        diffKeys.add(key)
      }
    }
    if (transition?.type === 'SMART_ANIMATE' && diffKeys.size > 0) {
      const keys = Array.from(diffKeys).map(toTransitionPropertyName)
      keys.sort()
      result.props.transition = `${fmtPct(transition.duration)}ms ${transition.easing.type.toLocaleLowerCase().replaceAll('_', '-')}`
      result.props.transitionProperty = keys.join(',')
    }
  }

  return result
}

/**
 * Get selector props for a specific variant group (e.g., size=Md, variant=primary).
 * This filters components by the given variant properties before calculating pseudo-selector diffs.
 *
 * @param componentSet The component set to extract selector props from
 * @param variantFilter Object containing variant key-value pairs to filter by (excluding effect and viewport)
 * @param viewportValue Optional viewport value to filter by (e.g., 'Desktop', 'Mobile')
 */
export async function getSelectorPropsForGroup(
  componentSet: ComponentSetNode,
  variantFilter: Record<string, string>,
  viewportValue?: string,
): Promise<Record<string, object | string>> {
  const hasEffect = !!componentSet.componentPropertyDefinitions.effect
  if (!hasEffect) return {}

  // Build cache key from componentSet.id + filter + viewport
  const setId = componentSet.id
  const filterKey = Object.entries(variantFilter)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|')
  const cacheKey = setId ? `${setId}::${filterKey}::${viewportValue ?? ''}` : ''

  if (cacheKey) {
    const cached = selectorPropsForGroupCache.get(cacheKey)
    if (cached) return cached
  }

  const promise = computeSelectorPropsForGroup(
    componentSet,
    variantFilter,
    viewportValue,
  )

  if (cacheKey) {
    selectorPropsForGroupCache.set(cacheKey, promise)
  }
  return promise
}

async function computeSelectorPropsForGroup(
  componentSet: ComponentSetNode,
  variantFilter: Record<string, string>,
  viewportValue?: string,
): Promise<Record<string, object | string>> {
  // Find viewport key if needed
  const viewportKey = Object.keys(
    componentSet.componentPropertyDefinitions,
  ).find((key) => key.toLowerCase() === 'viewport')

  // Filter components matching the variant filter (and viewport if specified)
  const matchingComponents = componentSet.children.filter((child) => {
    if (child.type !== 'COMPONENT') return false
    const variantProps = child.variantProperties || {}

    // Check all filter conditions match
    for (const [key, value] of Object.entries(variantFilter)) {
      if (variantProps[key] !== value) return false
    }

    // Check viewport if specified
    if (viewportValue && viewportKey) {
      if (variantProps[viewportKey] !== viewportValue) return false
    }

    return true
  }) as ComponentNode[]

  if (matchingComponents.length === 0) return {}

  // Find the default component in this group (effect=default)
  const defaultComponent = matchingComponents.find(
    (c) => c.variantProperties?.effect === 'default',
  )
  if (!defaultComponent) return {}

  const tGroup = perfStart()
  console.info(
    `[perf] getSelectorPropsForGroup: processing ${matchingComponents.length} matching components`,
  )
  const defaultProps = await getProps(defaultComponent)
  const result: Record<string, object | string> = {}
  const diffKeys = new Set<string>()

  // Calculate diffs for each effect state — fire all getProps() concurrently
  const effectComponents = matchingComponents.filter((c) => {
    const effect = c.variantProperties?.effect
    return effect && effect !== 'default'
  })
  const effectPropsResults: {
    effect: string
    props: Record<string, unknown>
  }[] = []
  for (const component of effectComponents) {
    const effect = component.variantProperties?.effect as string
    const props = await getProps(component)
    effectPropsResults.push({ effect, props })
  }
  for (const { effect, props } of effectPropsResults) {
    const def = difference(props, defaultProps)
    if (Object.keys(def).length === 0) continue

    result[`_${effect}`] = def
    for (const key of Object.keys(def)) {
      diffKeys.add(key)
    }
  }

  // Add transition if available
  if (diffKeys.size > 0) {
    const findNodeAction = (action: Action) => action.type === 'NODE'
    const getTransition = (reaction: Reaction) =>
      reaction.actions?.find(findNodeAction)?.transition
    const transition = defaultComponent.reactions
      ?.flatMap(getTransition)
      .flat()[0]
    if (transition?.type === 'SMART_ANIMATE') {
      const keys = Array.from(diffKeys).map(toTransitionPropertyName)
      keys.sort()
      result.transition = `${fmtPct(transition.duration)}ms ${transition.easing.type.toLocaleLowerCase().replaceAll('_', '-')}`
      result.transitionProperty = keys.join(',')
    }
  }

  perfEnd('getSelectorPropsForGroup.inner()', tGroup)
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
      if (value !== undefined && b[key] !== value) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, unknown>,
  )
}
