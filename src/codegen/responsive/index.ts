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

export type PropValue = boolean | string | number | undefined | null | object
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
  'p',
  'pt',
  'pr',
  'pb',
  'pl',
  'px',
  'py',
  'm',
  'mt',
  'mr',
  'mb',
  'ml',
  'mx',
  'my',
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
/**
 * Check if a prop key is a pseudo-selector prop (e.g., _hover, _active, _disabled, _focus).
 */
function isPseudoSelectorProp(key: string): boolean {
  return key.startsWith('_')
}

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
    // Pseudo-selector props (e.g., _hover, _active, _disabled) need special handling:
    // Their inner props should be merged into responsive arrays
    if (isPseudoSelectorProp(key)) {
      // Collect pseudo-selector objects from each breakpoint
      // For breakpoints that don't have this pseudo-selector, use empty object
      // so that inner props get null values for those breakpoints
      const pseudoPropsMap = new Map<BreakpointKey, Record<string, unknown>>()
      let hasPseudoSelector = false
      for (const [bp, props] of breakpointProps) {
        if (
          key in props &&
          typeof props[key] === 'object' &&
          props[key] !== null
        ) {
          pseudoPropsMap.set(bp, props[key] as Record<string, unknown>)
          hasPseudoSelector = true
        } else {
          // Breakpoint doesn't have this pseudo-selector, use empty object
          // This ensures inner props get null for this breakpoint
          pseudoPropsMap.set(bp, {})
        }
      }
      if (hasPseudoSelector) {
        // Recursively merge the inner props of pseudo-selector
        result[key] = mergePropsToResponsive(pseudoPropsMap)
      }
      continue
    }

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

/**
 * Convert viewport variant value to BreakpointKey.
 * Viewport values: "desktop" | "tablet" | "mobile" (case-insensitive comparison)
 */
export function viewportToBreakpoint(viewport: string): BreakpointKey {
  const lower = viewport.toLowerCase()
  if (lower === 'mobile') return 'mobile'
  if (lower === 'tablet') return 'tablet'
  return 'pc' // desktop → pc
}

/**
 * Represents a prop value that varies by variant.
 * The value is an object mapping variant values to prop values,
 * followed by bracket access with the variant prop name.
 *
 * Example: { scroll: [1, 2], default: [3, 4] }[status]
 */
export interface VariantPropValue {
  __variantProp: true
  variantKey: string // e.g., 'status'
  values: Record<string, PropValue> // e.g., { scroll: [1, 2], default: [3, 4] }
}

/**
 * Check if a value is a VariantPropValue.
 */
export function isVariantPropValue(value: unknown): value is VariantPropValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__variantProp' in value &&
    (value as VariantPropValue).__variantProp === true
  )
}

/**
 * Create a VariantPropValue.
 */
export function createVariantPropValue(
  variantKey: string,
  values: Record<string, PropValue>,
): VariantPropValue {
  return {
    __variantProp: true,
    variantKey,
    values,
  }
}

/**
 * Merge props across variants into variant-conditional objects.
 *
 * If all variants have the same value for a prop, it returns the single value.
 * If values differ, it creates a VariantPropValue.
 *
 * Each variant's props may already contain responsive arrays from breakpoint merging.
 *
 * Example:
 * Input:
 *   variantKey: 'status'
 *   variantProps: Map { 'scroll' => { w: [1, 2] }, 'default' => { w: [3, 4] } }
 * Output:
 *   { w: { __variantProp: true, variantKey: 'status', values: { scroll: [1, 2], default: [3, 4] } } }
 */
export function mergePropsToVariant(
  variantKey: string,
  variantProps: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // If only one variant, return props as-is.
  if (variantProps.size === 1) {
    const onlyProps = [...variantProps.values()][0]
    return onlyProps ? { ...onlyProps } : {}
  }

  // Collect all prop keys.
  const allKeys = new Set<string>()
  for (const props of variantProps.values()) {
    for (const key of Object.keys(props)) {
      allKeys.add(key)
    }
  }

  for (const key of allKeys) {
    // Pseudo-selector props (e.g., _hover, _active, _disabled) need special handling:
    // Their inner props should be merged with variant conditionals
    if (isPseudoSelectorProp(key)) {
      // Collect pseudo-selector objects from each variant
      const pseudoPropsMap = new Map<string, Record<string, unknown>>()
      for (const [variant, props] of variantProps) {
        if (
          key in props &&
          typeof props[key] === 'object' &&
          props[key] !== null
        ) {
          pseudoPropsMap.set(variant, props[key] as Record<string, unknown>)
        }
      }
      if (pseudoPropsMap.size > 0) {
        // Recursively merge the inner props of pseudo-selector
        result[key] = mergePropsToVariant(variantKey, pseudoPropsMap)
      }
      continue
    }
    // Collect values for each variant.
    const valuesByVariant: Record<string, PropValue> = {}
    let hasValue = false

    for (const [variant, props] of variantProps) {
      const value = key in props ? (props[key] as PropValue) : null
      if (value !== null && value !== undefined) {
        hasValue = true
      }
      valuesByVariant[variant] = value ?? null
    }

    if (!hasValue) continue

    // Check if all variants have the same value.
    const values = Object.values(valuesByVariant)
    const allSame = values.every((v) => isEqual(v, values[0]))

    if (allSame && values[0] !== null) {
      result[key] = values[0]
    } else {
      // Filter out null values from the variant object
      const filteredValues: Record<string, PropValue> = {}
      for (const [variant, value] of Object.entries(valuesByVariant)) {
        if (value !== null) {
          filteredValues[variant] = value
        }
      }
      if (Object.keys(filteredValues).length > 0) {
        result[key] = createVariantPropValue(variantKey, filteredValues)
      }
    }
  }

  return result
}
