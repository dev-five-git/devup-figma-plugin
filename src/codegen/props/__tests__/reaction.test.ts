import { describe, expect, it, vi } from 'vitest'
import { getReactionProps } from '../reaction'

// Mock figma global
const mockGetNodeByIdAsync = vi.fn()
;(global as any).figma = {
  getNodeByIdAsync: mockGetNodeByIdAsync,
}

describe('getReactionProps', () => {
  it('should return empty object when node has no reactions', async () => {
    const node = {
      type: 'FRAME',
    } as any

    const result = await getReactionProps(node)
    expect(result).toEqual({})
  })

  it('should return empty object when reactions array is empty', async () => {
    const node = {
      type: 'FRAME',
      reactions: [],
    } as any

    const result = await getReactionProps(node)
    expect(result).toEqual({})
  })

  it('should generate animation props for SMART_ANIMATE transition', async () => {
    const fromNode = {
      id: 'fromNode',
      type: 'FRAME',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
      rotation: 0,
      fills: [
        {
          type: 'SOLID',
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: '455:2021',
              navigation: 'CHANGE_TO',
              transition: {
                type: 'SMART_ANIMATE',
                easing: {
                  type: 'LINEAR',
                },
                duration: 1.2,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0.5,
          },
        },
      ],
    } as any

    const toNode = {
      id: '455:2021',
      type: 'FRAME',
      x: 100,
      y: 50,
      width: 200,
      height: 150,
      opacity: 0.5,
      rotation: 45,
      fills: [
        {
          type: 'SOLID',
          color: { r: 0, g: 1, b: 0 },
          opacity: 1,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(toNode)

    const result = await getReactionProps(fromNode)

    expect(result).toHaveProperty('animationName')
    expect(result).toHaveProperty('animationDuration', '1.2s')
    expect(result).toHaveProperty('animationDelay', '0.5s')
    expect(result).toHaveProperty('animationTimingFunction', 'linear')
    expect(result).toHaveProperty('animationFillMode', 'forwards')

    // Check if animationName contains keyframes function call
    expect(result.animationName).toContain('keyframes(')
    expect(result.animationName).toContain('100%')
  })

  it('should handle opacity change', async () => {
    const fromNode = {
      id: 'fromNode',
      type: 'FRAME',
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: '123',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.3,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const toNode = {
      id: '123',
      type: 'FRAME',
      opacity: 0.5,
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(toNode)

    const result = await getReactionProps(fromNode)

    expect(result.animationName).toBeDefined()
    expect(result.animationName).toContain('opacity')
    expect(result.animationName).toContain('0.5')
  })

  it('should handle position change', async () => {
    const fromNode = {
      id: 'fromNode',
      type: 'FRAME',
      x: 0,
      y: 0,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: '123',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const toNode = {
      id: '123',
      type: 'FRAME',
      x: 100,
      y: 50,
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(toNode)

    const result = await getReactionProps(fromNode)

    expect(result.animationName).toBeDefined()
    expect(result.animationName).toContain('transform')
    expect(result.animationName).toContain('translate')
  })

  it('should handle background color change', async () => {
    const fromNode = {
      id: 'fromNode',
      type: 'FRAME',
      fills: [
        {
          type: 'SOLID',
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: '123',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.3,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const toNode = {
      id: '123',
      type: 'FRAME',
      fills: [
        {
          type: 'SOLID',
          color: { r: 0, g: 1, b: 0 },
          opacity: 1,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(toNode)

    const result = await getReactionProps(fromNode)

    expect(result.animationName).toBeDefined()
    expect(result.animationName).toContain('bg')
    expect(result.animationName).toContain('rgb(0, 255, 0)')
  })

  it('should return empty object when no changes detected', async () => {
    const fromNode = {
      id: 'fromNode',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: '123',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.3,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const toNode = {
      id: '123',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(toNode)

    const result = await getReactionProps(fromNode)

    expect(result).toEqual({})
  })

  it('should handle different easing functions', async () => {
    const testEasing = async (easingType: string, expected: string) => {
      const fromNode = {
        id: 'fromNode',
        type: 'FRAME',
        opacity: 1,
        reactions: [
          {
            actions: [
              {
                type: 'NODE',
                destinationId: '123',
                transition: {
                  type: 'SMART_ANIMATE',
                  easing: { type: easingType },
                  duration: 0.3,
                },
              },
            ],
            trigger: {
              type: 'AFTER_TIMEOUT',
              timeout: 0,
            },
          },
        ],
      } as any

      const toNode = {
        id: '123',
        type: 'FRAME',
        opacity: 0.5,
      } as any

      mockGetNodeByIdAsync.mockResolvedValue(toNode)

      const result = await getReactionProps(fromNode)
      expect(result.animationTimingFunction).toBe(expected)
    }

    await testEasing('LINEAR', 'linear')
    await testEasing('EASE_IN', 'ease-in')
    await testEasing('EASE_OUT', 'ease-out')
    await testEasing('EASE_IN_AND_OUT', 'ease-in-out')
  })

  it('should handle animation chains with multiple nodes', async () => {
    const node1 = {
      id: 'node1',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node2',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const node2 = {
      id: 'node2',
      type: 'FRAME',
      x: 100,
      y: 0,
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node3',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const node3 = {
      id: 'node3',
      type: 'FRAME',
      x: 100,
      y: 100,
      opacity: 0.5,
    } as any

    mockGetNodeByIdAsync.mockImplementation(async (id: string) => {
      if (id === 'node2') return node2
      if (id === 'node3') return node3
      return null
    })

    const result = await getReactionProps(node1)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('1s') // 0.5s + 0.5s
    expect(result.animationName).toContain('50%') // intermediate keyframe
  })

  it('should prevent circular references', async () => {
    const node1 = {
      id: 'node1',
      type: 'FRAME',
      x: 0,
      y: 0,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node2',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const node2 = {
      id: 'node2',
      type: 'FRAME',
      x: 100,
      y: 0,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node1', // circular reference back to node1
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockImplementation(async (id: string) => {
      if (id === 'node2') return node2
      if (id === 'node1') return node1
      return null
    })

    const result = await getReactionProps(node1)

    // Should stop at node2 and not loop back to node1
    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.5s') // Only one transition
  })

  it('should prevent infinite loops with self-referencing nodes', async () => {
    const node1 = {
      id: 'node1',
      type: 'FRAME',
      x: 0,
      y: 0,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node2',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const node2 = {
      id: 'node2',
      type: 'FRAME',
      x: 100,
      y: 0,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node2', // self-reference
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(node2)

    const result = await getReactionProps(node1)

    // Should handle self-reference gracefully
    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.5s')
  })

  it('should match children by name and generate individual child animations', async () => {
    const buttonChild = {
      id: 'child1',
      name: 'Button',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
      parent: { id: 'frame1' },
    } as any

    const textChild = {
      id: 'child2',
      name: 'Text',
      type: 'TEXT',
      x: 50,
      y: 50,
      opacity: 1,
      parent: { id: 'frame1' },
    } as any

    const frame1 = {
      id: 'frame1',
      type: 'FRAME',
      name: 'Frame 1',
      children: [buttonChild, textChild],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'frame2',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const frame2 = {
      id: 'frame2',
      type: 'FRAME',
      name: 'Frame 2',
      children: [
        {
          id: 'child1-new',
          name: 'Button',
          type: 'FRAME',
          x: 100,
          y: 0,
          opacity: 0.5,
          fills: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0 }, opacity: 1 }],
        },
        {
          id: 'child2-new',
          name: 'Text',
          type: 'TEXT',
          x: 150,
          y: 100,
          opacity: 0.8,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(frame2)

    // Parent should return empty object and populate cache
    const parentResult = await getReactionProps(frame1)
    expect(parentResult).toEqual({})

    // Button child should get its animation from cache
    const buttonResult = await getReactionProps(buttonChild)
    expect(buttonResult.animationName).toBeDefined()
    expect(buttonResult.animationDuration).toBe('0.5s')
    expect(buttonResult.animationDelay).toBeUndefined() // No delay when timeout is 0
    expect(buttonResult.animationTimingFunction).toBe('linear')
    expect(buttonResult.animationFillMode).toBe('forwards')

    const buttonAnimation = buttonResult.animationName as string
    expect(buttonAnimation).toContain('keyframes(')
    expect(buttonAnimation).toContain('100%')
    expect(buttonAnimation).toContain('translate(100px, 0px)') // Position change
    expect(buttonAnimation).toContain('0.5') // Opacity change
    expect(buttonAnimation).toContain('rgb(0, 255, 0)') // Color change

    // Text child should get its animation from cache
    const textResult = await getReactionProps(textChild)
    expect(textResult.animationName).toBeDefined()
    expect(textResult.animationDuration).toBe('0.5s')

    const textAnimation = textResult.animationName as string
    expect(textAnimation).toContain('translate(100px, 50px)') // Position change
    expect(textAnimation).toContain('0.8') // Opacity change
  })

  it('should detect loop animations and add infinite iteration count', async () => {
    const node1 = {
      id: 'node1',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node2',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    const node2 = {
      id: 'node2',
      type: 'FRAME',
      x: 100,
      y: 0,
      opacity: 0.5,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node1', // loops back to node1
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0,
          },
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(node2)

    const result = await getReactionProps(node1)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.5s')
    expect(result.animationIterationCount).toBe('infinite')
  })
})
