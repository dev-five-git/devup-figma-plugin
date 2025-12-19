import { fmtPct } from '../utils/fmtPct'

/**
 * Represents a CSS keyframe animation
 */
export interface KeyframeAnimation {
  /** Unique animation name */
  name: string
  /** CSS @keyframes definition */
  keyframes: string
  /** CSS animation property value */
  animation: string
  /** Properties that will be animated */
  properties: string[]
}

/**
 * Generates a unique animation name based on effect type and property hash
 */
function generateAnimationName(
  effect: string,
  properties: string[],
  nodeId: string,
): string {
  const propHash = properties.sort().join('-')
  const hash = simpleHash(`${effect}-${propHash}-${nodeId}`)
  return `${effect}-animation-${hash}`
}

/**
 * Simple hash function for generating unique identifiers
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8)
}

/**
 * Converts CSS property values to string format for keyframes
 */
function formatPropertyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * Generates CSS @keyframes string from property differences
 */
function generateKeyframesCSS(
  animationName: string,
  fromProps: Record<string, unknown>,
  toProps: Record<string, unknown>,
  properties: string[],
): string {
  const fromStyles = properties
    .map((prop) => {
      const value = fromProps[prop]
      return `    ${prop}: ${formatPropertyValue(value)};`
    })
    .join('\n')

  const toStyles = properties
    .map((prop) => {
      const value = toProps[prop]
      return `    ${prop}: ${formatPropertyValue(value)};`
    })
    .join('\n')

  return `@keyframes ${animationName} {
  from {
${fromStyles}
  }
  to {
${toStyles}
  }
}`
}

/**
 * Generates a keyframe animation from Figma SMART_ANIMATE transition
 *
 * @param defaultProps - Properties of the default variant (from state)
 * @param targetProps - Properties of the target variant (to state)
 * @param transition - Figma transition configuration
 * @param effect - Effect type ('hover', 'active', etc.)
 * @param nodeId - Node ID for generating unique animation names
 * @returns KeyframeAnimation object with animation details
 */
export function generateKeyframeFromTransition(
  defaultProps: Record<string, unknown>,
  targetProps: Record<string, unknown>,
  transition: Transition,
  effect: string,
  nodeId: string,
): KeyframeAnimation {
  // Find all properties that differ between states
  const properties = Object.keys(targetProps).filter(
    (key) => defaultProps[key] !== targetProps[key],
  )

  // Generate unique animation name
  const animationName = generateAnimationName(effect, properties, nodeId)

  // Generate @keyframes CSS
  const keyframes = generateKeyframesCSS(
    animationName,
    defaultProps,
    targetProps,
    properties,
  )

  // Format easing function
  const easingFunction = transition.easing.type
    .toLowerCase()
    .replaceAll('_', '-')

  // Generate animation property value (convert seconds to milliseconds)
  const durationMs = fmtPct(transition.duration * 1000)
  const animation = `${animationName} ${durationMs}ms ${easingFunction} forwards`

  return {
    name: animationName,
    keyframes,
    animation,
    properties,
  }
}

/**
 * Generates multiple keyframe animations for different effects
 *
 * @param defaultProps - Properties of the default variant
 * @param effectProps - Map of effect types to their property sets
 * @param transition - Figma transition configuration
 * @param nodeId - Node ID for generating unique animation names
 * @returns Array of KeyframeAnimation objects
 */
export function generateKeyframesForEffects(
  defaultProps: Record<string, unknown>,
  effectProps: Map<string, Record<string, unknown>>,
  transition: Transition,
  nodeId: string,
): KeyframeAnimation[] {
  const animations: KeyframeAnimation[] = []

  for (const [effect, targetProps] of effectProps) {
    // Find properties that differ from default
    const diffProps = Object.entries(targetProps).reduce(
      (acc, [key, value]) => {
        if (defaultProps[key] !== value) {
          acc[key] = value
        }
        return acc
      },
      {} as Record<string, unknown>,
    )

    // Only generate animation if there are differences
    if (Object.keys(diffProps).length > 0) {
      const animation = generateKeyframeFromTransition(
        defaultProps,
        diffProps,
        transition,
        effect,
        nodeId,
      )
      animations.push(animation)
    }
  }

  return animations
}

/**
 * Checks if a transition is a SMART_ANIMATE transition
 */
export function isSmartAnimateTransition(
  transition: Transition | undefined,
): transition is Transition & { type: 'SMART_ANIMATE' } {
  return transition?.type === 'SMART_ANIMATE'
}

/**
 * Extracts transition from Figma reactions
 */
export function extractTransitionFromReactions(
  reactions: readonly Reaction[],
): Transition | undefined {
  return reactions
    .flatMap(
      (reaction) =>
        reaction.actions?.find((action) => action.type === 'NODE')?.transition,
    )
    .filter((t): t is Transition => t !== undefined)[0]
}
