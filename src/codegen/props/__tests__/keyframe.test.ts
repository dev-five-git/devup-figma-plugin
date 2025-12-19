import { describe, expect, test } from 'bun:test'
import {
  extractTransitionFromReactions,
  generateKeyframeFromTransition,
  generateKeyframesForEffects,
  isSmartAnimateTransition,
} from '../keyframe'

describe('keyframe generation', () => {
  const mockTransition = {
    type: 'SMART_ANIMATE' as const,
    duration: 0.3,
    easing: { type: 'EASE_IN_OUT' as const },
  }

  describe('isSmartAnimateTransition', () => {
    test('returns true for SMART_ANIMATE transition', () => {
      expect(isSmartAnimateTransition(mockTransition)).toBe(true)
    })

    test('returns false for non-SMART_ANIMATE transition', () => {
      const dissolveTransition = {
        type: 'DISSOLVE',
        duration: 0.3,
        easing: { type: 'EASE_IN_OUT' },
      } as unknown as Transition
      expect(isSmartAnimateTransition(dissolveTransition)).toBe(false)
    })

    test('returns false for undefined', () => {
      expect(isSmartAnimateTransition(undefined)).toBe(false)
    })
  })

  describe('extractTransitionFromReactions', () => {
    test('extracts transition from reactions', () => {
      const reactions = [
        {
          trigger: { type: 'ON_HOVER' as const },
          actions: [
            {
              type: 'NODE' as const,
              transition: mockTransition,
            },
          ],
        },
      ] as unknown as Reaction[]

      const result = extractTransitionFromReactions(reactions)
      expect(result).toEqual(mockTransition)
    })

    test('returns undefined for empty reactions', () => {
      const result = extractTransitionFromReactions([])
      expect(result).toBeUndefined()
    })

    test('returns undefined for reactions without transition', () => {
      const reactions = [
        {
          trigger: { type: 'ON_HOVER' as const },
          actions: [
            {
              type: 'NODE' as const,
            },
          ],
        },
      ] as unknown as Reaction[]

      const result = extractTransitionFromReactions(reactions)
      expect(result).toBeUndefined()
    })
  })

  describe('generateKeyframeFromTransition', () => {
    test('generates keyframe animation for opacity change', () => {
      const defaultProps = { opacity: '1' }
      const targetProps = { opacity: '0.8' }
      const effect = 'hover'
      const nodeId = 'test-node-123'

      const result = generateKeyframeFromTransition(
        defaultProps,
        targetProps,
        mockTransition,
        effect,
        nodeId,
      )

      expect(result.properties).toEqual(['opacity'])
      expect(result.animation).toContain('300ms')
      expect(result.animation).toContain('ease-in-out')
      expect(result.animation).toContain('forwards')
      expect(result.keyframes).toContain('@keyframes')
      expect(result.keyframes).toContain('from')
      expect(result.keyframes).toContain('to')
      expect(result.keyframes).toContain('opacity: 1')
      expect(result.keyframes).toContain('opacity: 0.8')
    })

    test('generates keyframe animation for multiple properties', () => {
      const defaultProps = { opacity: '1', backgroundColor: '#ffffff' }
      const targetProps = { opacity: '0.8', backgroundColor: '#000000' }
      const effect = 'hover'
      const nodeId = 'test-node-456'

      const result = generateKeyframeFromTransition(
        defaultProps,
        targetProps,
        mockTransition,
        effect,
        nodeId,
      )

      expect(result.properties).toHaveLength(2)
      expect(result.properties).toContain('opacity')
      expect(result.properties).toContain('backgroundColor')
      expect(result.keyframes).toContain('opacity: 1')
      expect(result.keyframes).toContain('opacity: 0.8')
      expect(result.keyframes).toContain('backgroundColor: #ffffff')
      expect(result.keyframes).toContain('backgroundColor: #000000')
    })

    test('generates unique animation names for different effects', () => {
      const defaultProps = { opacity: '1' }
      const targetProps = { opacity: '0.8' }
      const nodeId = 'test-node-789'

      const hoverResult = generateKeyframeFromTransition(
        defaultProps,
        targetProps,
        mockTransition,
        'hover',
        nodeId,
      )

      const activeResult = generateKeyframeFromTransition(
        defaultProps,
        targetProps,
        mockTransition,
        'active',
        nodeId,
      )

      expect(hoverResult.name).not.toBe(activeResult.name)
      expect(hoverResult.name).toContain('hover')
      expect(activeResult.name).toContain('active')
    })

    test('formats easing function correctly', () => {
      const defaultProps = { opacity: '1' }
      const targetProps = { opacity: '0.8' }
      const transitionWithDifferentEasing = {
        type: 'SMART_ANIMATE' as const,
        duration: 0.5,
        easing: { type: 'EASE_IN' as const },
      }

      const result = generateKeyframeFromTransition(
        defaultProps,
        targetProps,
        transitionWithDifferentEasing,
        'hover',
        'node-id',
      )

      expect(result.animation).toContain('500ms')
      expect(result.animation).toContain('ease-in')
    })
  })

  describe('generateKeyframesForEffects', () => {
    test('generates multiple keyframe animations', () => {
      const defaultProps = { opacity: '1', backgroundColor: '#ffffff' }
      const effectProps = new Map([
        ['hover', { opacity: '0.8' }],
        ['active', { opacity: '0.6' }],
      ])
      const nodeId = 'test-node-multi'

      const results = generateKeyframesForEffects(
        defaultProps,
        effectProps,
        mockTransition,
        nodeId,
      )

      expect(results).toHaveLength(2)
      expect(results[0].name).toContain('hover')
      expect(results[1].name).toContain('active')
      expect(results[0].properties).toEqual(['opacity'])
      expect(results[1].properties).toEqual(['opacity'])
    })

    test('skips effects with no property differences', () => {
      const defaultProps = { opacity: '1' }
      const effectProps = new Map([
        ['hover', { opacity: '1' }], // Same as default
        ['active', { opacity: '0.8' }],
      ])
      const nodeId = 'test-node-skip'

      const results = generateKeyframesForEffects(
        defaultProps,
        effectProps,
        mockTransition,
        nodeId,
      )

      expect(results).toHaveLength(1)
      expect(results[0].name).toContain('active')
    })

    test('returns empty array when no effects differ', () => {
      const defaultProps = { opacity: '1' }
      const effectProps = new Map([['hover', { opacity: '1' }]])
      const nodeId = 'test-node-empty'

      const results = generateKeyframesForEffects(
        defaultProps,
        effectProps,
        mockTransition,
        nodeId,
      )

      expect(results).toHaveLength(0)
    })

    test('handles complex property values', () => {
      const defaultProps = {
        transform: 'translateX(0px)',
        boxShadow: '0 0 0 rgba(0,0,0,0)',
      }
      const effectProps = new Map([
        [
          'hover',
          {
            transform: 'translateX(10px)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          },
        ],
      ])
      const nodeId = 'test-node-complex'

      const results = generateKeyframesForEffects(
        defaultProps,
        effectProps,
        mockTransition,
        nodeId,
      )

      expect(results).toHaveLength(1)
      expect(results[0].properties).toContain('transform')
      expect(results[0].properties).toContain('boxShadow')
      expect(results[0].keyframes).toContain('translateX(0px)')
      expect(results[0].keyframes).toContain('translateX(10px)')
    })
  })
})
