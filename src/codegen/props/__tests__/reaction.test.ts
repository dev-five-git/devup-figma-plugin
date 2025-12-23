import { describe, expect, it, vi } from 'vitest'
import { getReactionProps } from '../reaction'

// Mock figma global
const mockGetNodeByIdAsync = vi.fn()
const mockGetVariableByIdAsync = vi.fn()
;(global as any).figma = {
  getNodeByIdAsync: mockGetNodeByIdAsync,
  util: {
    rgba: (color: any) => color,
  },
  variables: {
    getVariableByIdAsync: mockGetVariableByIdAsync,
  },
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
    expect(result.animationName).toContain('#0F0') // hex format instead of rgb
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

    // Should stop at node2 and not loop back to node1 (prevents infinite recursion)
    // But it's detected as a loop, so duration includes return-to-initial step
    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('1s') // 0.5s + 0.5s (return to initial)
    expect(result.animationIterationCount).toBe('infinite')
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
    expect(buttonAnimation).toContain('#0F0') // Color change (hex format)

    // Text child should get its animation from cache
    const textResult = await getReactionProps(textChild)
    expect(textResult.animationName).toBeDefined()
    expect(textResult.animationDuration).toBe('0.5s')

    const textAnimation = textResult.animationName as string
    expect(textAnimation).toContain('translate(100px, 50px)') // Position change
    expect(textAnimation).toContain('0.8') // Opacity change
  })

  it('should detect loop animations and add infinite iteration count with 100% returning to initial', async () => {
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
    // Duration should include the return-to-initial step: 0.5s + 0.5s = 1s
    expect(result.animationDuration).toBe('1s')
    expect(result.animationIterationCount).toBe('infinite')

    // Check that keyframes include 100% returning to initial state
    const animationName = result.animationName as string
    expect(animationName).toContain('100%')
    // The 50% keyframe should contain the changes, and 100% should return to initial
    expect(animationName).toContain('50%')
  })

  it('should return cached child animation from parent cache', async () => {
    const buttonChild = {
      id: 'child1',
      name: 'Button',
      type: 'FRAME',
      x: 0,
      y: 0,
      parent: { id: 'parent' },
    } as any

    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [buttonChild],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.3,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0.01,
          },
        },
      ],
    } as any

    const destNode = {
      id: 'dest',
      type: 'FRAME',
      children: [
        {
          id: 'child1-new',
          name: 'Button',
          type: 'FRAME',
          x: 100,
          y: 0,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    // First call to parent should populate cache
    await getReactionProps(parentNode)

    // Second call to child should use cached value
    const childResult = await getReactionProps(buttonChild)

    expect(childResult.animationName).toBeDefined()
    expect(childResult.animationDelay).toBe('0.01s')
  })

  it('should handle failed node lookup gracefully', async () => {
    const node = {
      id: 'node1',
      type: 'FRAME',
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'missing',
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

    mockGetNodeByIdAsync.mockRejectedValue(new Error('Node not found'))

    // Suppress console.error for this test
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const result = await getReactionProps(node)

    expect(result).toEqual({})

    consoleErrorSpy.mockRestore()
  })

  it('should handle DOCUMENT or PAGE node types', async () => {
    const node = {
      id: 'node1',
      type: 'FRAME',
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'page-node',
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

    const pageNode = {
      id: 'page-node',
      type: 'PAGE',
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(pageNode)

    const result = await getReactionProps(node)

    expect(result).toEqual({})
  })

  it('should handle animation chain error gracefully', async () => {
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

    mockGetNodeByIdAsync.mockImplementation(async (id: string) => {
      if (id === 'node2') return node2
      if (id === 'node3') throw new Error('Failed to get node3')
      return null
    })

    // Suppress console.error for this test
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const result = await getReactionProps(node1)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.5s')

    consoleErrorSpy.mockRestore()
  })

  it('should match children by name with loop and delay', async () => {
    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [
        {
          id: 'child1',
          name: 'Button',
          type: 'FRAME',
          x: 0,
          y: 0,
          parent: { id: 'parent' },
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.5,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0.02,
          },
        },
      ],
    } as any

    const destNode = {
      id: 'dest',
      type: 'FRAME',
      children: [
        {
          id: 'child1-new',
          name: 'Button',
          type: 'FRAME',
          x: 100,
          y: 0,
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'parent',
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

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    await getReactionProps(parentNode)

    const childNode = parentNode.children[0]
    const result = await getReactionProps(childNode)

    expect(result.animationIterationCount).toBe('infinite')
    expect(result.animationDelay).toBe('0.02s')
  })

  it('should handle children with no matching nodes in some steps', async () => {
    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [
        {
          id: 'child1',
          name: 'Button',
          type: 'FRAME',
          x: 0,
          y: 0,
          parent: { id: 'parent' },
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
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

    // Destination has no children named 'Button'
    const destNode = {
      id: 'dest',
      type: 'FRAME',
      children: [
        {
          id: 'child2',
          name: 'Text',
          type: 'FRAME',
          x: 100,
          y: 0,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    const result = await getReactionProps(parentNode)

    expect(result).toEqual({})
  })

  it('should handle parent and child nodes without children prop', async () => {
    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      // No children property
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
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

    const destNode = {
      id: 'dest',
      type: 'FRAME',
      x: 100,
      y: 0,
      opacity: 0.5,
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    const result = await getReactionProps(parentNode)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.5s')
  })

  it('should return empty when child not found in cache', async () => {
    const childWithNoCache = {
      id: 'child-no-cache',
      name: 'NoCache',
      type: 'FRAME',
      parent: { id: 'non-existent-parent' },
    } as any

    const result = await getReactionProps(childWithNoCache)

    expect(result).toEqual({})
  })

  it('should handle node with direct self-loop (currentNodeId === startNode.id)', async () => {
    const loopNode = {
      id: 'loop-node',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'loop-node',
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

    mockGetNodeByIdAsync.mockResolvedValue(loopNode)

    const result = await getReactionProps(loopNode)

    // Direct self-loop should result in empty (isLoop: true but chain is empty)
    expect(result).toEqual({})
  })

  it('should handle chain with nested loop detection (isLoop propagation)', async () => {
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
      opacity: 0.8,
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
      x: 200,
      y: 0,
      opacity: 0.5,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node1',
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
      if (id === 'node3') return node3
      return null
    })

    const result = await getReactionProps(node1)

    expect(result.animationName).toBeDefined()
    expect(result.animationIterationCount).toBe('infinite')
    // 0.5 + 0.5 for chain + 0.5 for return-to-initial = 1.5s
    expect(result.animationDuration).toBe('1.5s')
    // Keyframes should include 100% returning to initial state
    const animationName = result.animationName as string
    expect(animationName).toContain('100%')
  })

  it('should handle visited node in recursive chain (line 284)', async () => {
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
                duration: 0.3,
              },
            },
            {
              type: 'NODE',
              destinationId: 'node3',
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

    const node2 = {
      id: 'node2',
      type: 'FRAME',
      x: 50,
      y: 0,
      opacity: 0.8,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node3',
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

    const node3 = {
      id: 'node3',
      type: 'FRAME',
      x: 100,
      y: 0,
      opacity: 0.5,
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'node2',
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

    mockGetNodeByIdAsync.mockImplementation(async (id: string) => {
      if (id === 'node2') return node2
      if (id === 'node3') return node3
      return null
    })

    const result = await getReactionProps(node1)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.6s')
  })

  it('should handle children without matching in prev/current nodes (line 413)', async () => {
    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [
        {
          id: 'child1',
          name: 'Button',
          type: 'FRAME',
          x: 0,
          y: 0,
          parent: { id: 'parent' },
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
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

    // Dest has no children property
    const destNode = {
      id: 'dest',
      type: 'FRAME',
      x: 100,
      y: 0,
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    const result = await getReactionProps(parentNode)

    expect(result).toEqual({})
  })

  it('should handle firstChild missing in animation (line 465-466)', async () => {
    const child1 = {
      id: 'child1',
      name: 'Button',
      type: 'FRAME',
      x: 0,
      y: 0,
      opacity: 1,
      parent: { id: 'parent' },
    } as any

    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [child1],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
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

    const destNode = {
      id: 'dest',
      type: 'FRAME',
      children: [
        {
          id: 'child1-dest',
          name: 'Button',
          type: 'FRAME',
          x: 100,
          y: 0,
          opacity: 0.5,
        },
      ],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest2',
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

    const destNode2 = {
      id: 'dest2',
      type: 'FRAME',
      children: [
        {
          id: 'child1-dest2',
          name: 'Button',
          type: 'FRAME',
          x: 200,
          y: 0,
          opacity: 1,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockImplementation(async (id: string) => {
      if (id === 'dest') return destNode
      if (id === 'dest2') return destNode2
      return null
    })

    await getReactionProps(parentNode)

    const result = await getReactionProps(child1)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('1s')
  })

  it('should return cached child animation when cache exists for child name (line 41-43)', async () => {
    const child1 = {
      id: 'child1',
      name: 'AnimatedButton',
      type: 'FRAME',
      x: 0,
      y: 0,
      parent: { id: 'parent' },
    } as any

    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [child1],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
              transition: {
                type: 'SMART_ANIMATE',
                duration: 0.8,
              },
            },
          ],
          trigger: {
            type: 'AFTER_TIMEOUT',
            timeout: 0.03,
          },
        },
      ],
    } as any

    const destNode = {
      id: 'dest',
      type: 'FRAME',
      children: [
        {
          id: 'child1-dest',
          name: 'AnimatedButton',
          type: 'FRAME',
          x: 150,
          y: 50,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    await getReactionProps(parentNode)

    const result = await getReactionProps(child1)

    expect(result.animationName).toBeDefined()
    expect(result.animationDuration).toBe('0.8s')
    expect(result.animationDelay).toBe('0.03s')
  })

  it('should handle when parent cache exists but child name not in cache (line 43)', async () => {
    const child1 = {
      id: 'child1',
      name: 'CachedButton',
      type: 'FRAME',
      x: 0,
      y: 0,
      parent: { id: 'parent' },
    } as any

    const child2 = {
      id: 'child2',
      name: 'UncachedButton',
      type: 'FRAME',
      x: 0,
      y: 0,
      parent: { id: 'parent' },
    } as any

    const parentNode = {
      id: 'parent',
      type: 'FRAME',
      children: [child1],
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              destinationId: 'dest',
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

    const destNode = {
      id: 'dest',
      type: 'FRAME',
      children: [
        {
          id: 'child1-dest',
          name: 'CachedButton',
          type: 'FRAME',
          x: 100,
          y: 0,
        },
      ],
    } as any

    mockGetNodeByIdAsync.mockResolvedValue(destNode)

    await getReactionProps(parentNode)

    const result = await getReactionProps(child2)

    expect(result).toEqual({})
  })
})
