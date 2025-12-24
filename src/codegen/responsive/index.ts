import { isDefaultProp } from '../utils/is-default-prop'

// Breakpoint thresholds (by width)
// Array indices: mobile=0, sm=1, tablet=2, lg=3, pc=4
// Always 5 slots
export const BREAKPOINTS = {
  mobile: 480, // index 0
  sm: 768, // index 1
  tablet: 992, // index 2
  lg: 1280, // index 3
  pc: Infinity, // index 4
} as const

export type BreakpointKey = keyof typeof BREAKPOINTS

// Breakpoint order (by index)
// [0: mobile, 1: sm, 2: tablet, 3: lg, 4: pc]
export const BREAKPOINT_ORDER: BreakpointKey[] = [
  'mobile', // 0
  'sm', // 1
  'tablet', // 2
  'lg', // 3
  'pc', // 4
]

// Array index for each breakpoint
export const BREAKPOINT_INDEX: Record<BreakpointKey, number> = {
  mobile: 0,
  sm: 1,
  tablet: 2,
  lg: 3,
  pc: 4,
}

/**
 * Decide breakpoint by width.
 */
export function getBreakpointByWidth(width: number): BreakpointKey {
  if (width <= BREAKPOINTS.mobile) return 'mobile'
  if (width <= BREAKPOINTS.sm) return 'sm'
  if (width <= BREAKPOINTS.tablet) return 'tablet'
  if (width <= BREAKPOINTS.lg) return 'lg'
  return 'pc'
}

/**
 * Group Section children by width.
 */
export function groupChildrenByBreakpoint(
  children: readonly SceneNode[],
): Map<BreakpointKey, SceneNode[]> {
  const groups = new Map<BreakpointKey, SceneNode[]>()

  for (const child of children) {
    if ('width' in child) {
      const breakpoint = getBreakpointByWidth(child.width)
      const group = groups.get(breakpoint) || []
      group.push(child)
      groups.set(breakpoint, group)
    }
  }

  return groups
}

type PropValue = boolean | string | number | undefined | null | object
export type Props = Record<string, PropValue>
const SPECIAL_PROPS_WITH_INITIAL = new Set([
  'display',
  'position',
  'pos',
  'transform',
  'w',
  'h',
  'textAlign',
  // layout related
  'flexDir',
  'flexWrap',
  'justify',
  'alignItems',
  'alignContent',
  'alignSelf',
  'gap',
  'rowGap',
  'columnGap',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'order',
  // grid layout
  'gridTemplateColumns',
  'gridTemplateRows',
  'gridColumn',
  'gridRow',
  'gridArea',
  // position related
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
  // overflow
  'overflow',
  'overflowX',
  'overflowY',
])

/**
 * Compare two prop values for equality.
 */
function isEqual(a: PropValue, b: PropValue): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/**
 * Optimize responsive array.
 *
 * Rules:
 * 1. If only index 0 has a value and the rest are null, return single value.
 * 2. Consecutive identical values keep the first, later ones become null.
 * 3. Remove trailing nulls only.
 * 4. If the first value is default for that prop, replace with null.
 *
 * Examples:
 * ["100px", null, null] -> "100px" (only first has value)
 * ["100px", "100px", "100px"] -> "100px" (all same)
 * ["200px", "200px", "100px"] -> ["200px", null, "100px"]
 * [null, null, "none"] -> [null, null, "none"] (keeps leading nulls)
 * [null, null, "none", null, null] -> [null, null, "none"] (trim trailing null)
 * ["100px", "200px", "200px"] -> ["100px", "200px"] (trailing equal treated as trailing null)
 * ["flex-start", null, "center"] -> [null, null, "center"] (first value is default for alignItems)
 */
export function optimizeResponsiveValue(
  arr: (PropValue | null)[],
  key?: string,
): PropValue | (PropValue | null)[] {
  const nonNullValues = arr.filter((v) => v !== null)
  if (nonNullValues.length === 0) return null

  // Collapse consecutive identical values after the first to null.
  const optimized: (PropValue | null)[] = [...arr]
  let lastValue: PropValue | null = null

  for (let i = 0; i < optimized.length; i++) {
    const current = optimized[i]
    if (current !== null) {
      if (isEqual(current, lastValue)) {
        optimized[i] = null
      } else {
        lastValue = current
      }
    }
  }

  // If the first value is default for that prop, replace with null.
  if (key && optimized[0] !== null && isDefaultProp(key, optimized[0])) {
    optimized[0] = null
  }

  // Remove trailing nulls.
  while (optimized.length > 0 && optimized[optimized.length - 1] === null) {
    optimized.pop()
  }

  // If empty array after optimization, return null.
  if (optimized.length === 0) {
    return null
  }

  // If only index 0 has value, return single value.
  if (optimized.length === 1 && optimized[0] !== null) {
    return optimized[0]
  }

  return optimized
}

/**
 * Merge props across breakpoints into responsive arrays.
 * Always 5 slots: [mobile, sm, tablet, lg, pc]; trailing nulls trimmed.
 */
export function mergePropsToResponsive(
  breakpointProps: Map<BreakpointKey, Record<string, unknown>>,
): Record<string, unknown> {
  const result: Props = {}

  // If only one breakpoint, return props as-is.
  if (breakpointProps.size === 1) {
    const onlyProps = [...breakpointProps.values()][0]
    return onlyProps ? { ...onlyProps } : {}
  }

  // Collect all prop keys.
  const allKeys = new Set<string>()
  for (const props of breakpointProps.values()) {
    for (const key of Object.keys(props)) {
      allKeys.add(key)
    }
  }

  for (const key of allKeys) {
    // Collect values for 5 fixed slots.
    const values: (PropValue | null)[] = BREAKPOINT_ORDER.map((bp) => {
      const props = breakpointProps.get(bp)
      if (!props) return null
      const value = key in props ? props[key] : null
      return value ?? null
    })

    // For display/position family, add 'initial' at the first EXISTING breakpoint
    // where the value changes to null (after a non-null value).
    // This ensures proper reset for larger breakpoints.
    let valuesToOptimize = values
    if (SPECIAL_PROPS_WITH_INITIAL.has(key)) {
      // Find the last non-null value position in original values
      let lastNonNullIdx = -1
      for (let i = values.length - 1; i >= 0; i--) {
        if (values[i] !== null) {
          lastNonNullIdx = i
          break
        }
      }

      // Only need 'initial' if the last non-null is not at the end (pc)
      if (lastNonNullIdx >= 0 && lastNonNullIdx < BREAKPOINT_ORDER.length - 1) {
        // Find the first EXISTING breakpoint after the last non-null value
        // that has a null/undefined value (where we need to reset)
        let initialInsertIdx = -1
        for (let i = lastNonNullIdx + 1; i < BREAKPOINT_ORDER.length; i++) {
          const bp = BREAKPOINT_ORDER[i]
          // Check if this breakpoint exists in input
          if (breakpointProps.has(bp)) {
            initialInsertIdx = i
            break
          }
        }

        // Only add 'initial' if we found a position to insert
        if (initialInsertIdx >= 0) {
          // Work with original values array to preserve null positions
          const newArr = [...values]
          newArr[initialInsertIdx] = 'initial'
          // Trim values after initialInsertIdx (they're not needed)
          newArr.length = initialInsertIdx + 1
          valuesToOptimize = newArr
        }
      }
    }

    // Optimize: single when all same, otherwise array.
    const optimized = optimizeResponsiveValue(valuesToOptimize, key)

    if (optimized !== null) {
      result[key] = optimized
    }
  }
  return result
}

export interface ResponsiveNodeGroup {
  breakpoint: BreakpointKey
  node: SceneNode
  props: Props
}

/**
 * Group nodes with the same name for responsive matching.
 */
export function groupNodesByName(
  breakpointNodes: Map<BreakpointKey, SceneNode[]>,
): Map<string, ResponsiveNodeGroup[]> {
  const result = new Map<string, ResponsiveNodeGroup[]>()

  for (const [breakpoint, nodes] of breakpointNodes) {
    for (const node of nodes) {
      const name = node.name
      const group = result.get(name) || []
      group.push({ breakpoint, node, props: {} })
      result.set(name, group)
    }
  }

  return result
}
