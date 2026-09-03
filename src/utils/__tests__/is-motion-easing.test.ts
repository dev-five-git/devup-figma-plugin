import { describe, expect, test } from 'bun:test'
import { isMotionEasing } from '../is-motion-easing'

describe('isMotionEasing', () => {
  test('should check motionEasing', () => {
    expect(isMotionEasing({ type: 'EASE_IN_AND_OUT' })).toBe(true)
    expect(isMotionEasing({ type: 'CUSTOM_CUBIC_BEZIER' })).toBe(true)

    expect(isMotionEasing({ r: 0, g: 0, b: 0, a: 1 })).toBe(false)
    expect(isMotionEasing({ id: 'id', type: 'VARIABLE_ALIAS' })).toBe(false)
    expect(isMotionEasing('#fff')).toBe(false)
    expect(isMotionEasing(1)).toBe(false)
    expect(isMotionEasing(null)).toBe(false)
    expect(isMotionEasing(undefined)).toBe(false)
  })
})
