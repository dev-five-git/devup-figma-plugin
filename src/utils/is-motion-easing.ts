/**
 * `VariableValue` gained `MotionEasing` with Figma's Motion API, so colour code
 * paths have to narrow it out. It is the only object-valued variant that
 * carries a `type` other than `VariableAlias` — `RGB`/`RGBA` have none.
 */
export function isMotionEasing(value: unknown): value is MotionEasing {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type !== 'VARIABLE_ALIAS'
  )
}
