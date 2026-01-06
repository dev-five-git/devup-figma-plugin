import { describe, expect, test } from 'bun:test'
import { assembleNodeTree, setupVariableMocks } from '../assemble-node-tree'

describe('assembleNodeTree', () => {
  test('should add getMainComponentAsync mock to INSTANCE node', async () => {
    // Create node data for an INSTANCE node
    const nodes = [
      {
        id: 'instance-1',
        name: 'InstanceNode',
        type: 'INSTANCE',
        mainComponent: null,
      },
    ]

    // assembleNodeTree processes nodes and adds getMainComponentAsync to INSTANCE nodes
    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.type).toBe('INSTANCE')

    // The prepared node should have getMainComponentAsync method
    expect(typeof rootNode.getMainComponentAsync).toBe('function')

    // Call the method and verify it returns null
    const getMainComponentAsync =
      rootNode.getMainComponentAsync as () => Promise<unknown>
    const mainComponent = await getMainComponentAsync()
    expect(mainComponent).toBeNull()
  })

  test('should setup variable mocks when variables provided', async () => {
    // Setup globalThis.figma first (required for setupVariableMocks)
    ;(globalThis as unknown as { figma: Record<string, unknown> }).figma = {}

    // Create nodes with variable reference in fills
    const nodes = [
      {
        id: 'node-1',
        name: 'NodeWithVariable',
        type: 'FRAME',
        fills: [
          {
            type: 'SOLID',
            boundVariables: {
              color: 'VariableID:456',
            },
          },
        ],
      },
    ]

    const variables = [{ id: 'VariableID:456', name: 'secondary-color' }]

    // Call assembleNodeTree with variables
    const rootNode = assembleNodeTree(nodes, variables)

    expect(rootNode.id).toBe('node-1')

    // Verify variable mock was set up
    const g = globalThis as {
      figma?: {
        variables?: { getVariableByIdAsync?: (id: string) => Promise<unknown> }
      }
    }
    expect(g.figma?.variables?.getVariableByIdAsync).toBeDefined()

    // Call the mock to verify it returns the variable info
    const getVariableByIdAsync = g.figma?.variables?.getVariableByIdAsync
    if (getVariableByIdAsync) {
      const variable = await getVariableByIdAsync('VariableID:456')
      expect(variable).toEqual({
        id: 'VariableID:456',
        name: 'secondary-color',
      })
    }
  })

  test('should add getMainComponentAsync to non-INSTANCE nodes', async () => {
    // Create a FRAME node (not INSTANCE)
    const nodes = [
      {
        id: 'frame-1',
        name: 'FrameNode',
        type: 'FRAME',
      },
    ]

    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.type).toBe('FRAME')

    // The FRAME node should have getMainComponentAsync method (default fallback)
    expect(typeof rootNode.getMainComponentAsync).toBe('function')

    // Call the method and verify it returns null
    const getMainComponentAsync =
      rootNode.getMainComponentAsync as () => Promise<unknown>
    const result = await getMainComponentAsync()
    expect(result).toBeNull()
  })

  test('should link children by id references', () => {
    // Create nodes with children as string IDs (how test data comes from toTestCaseFormat)
    const nodes = [
      {
        id: 'parent-1',
        name: 'Parent',
        type: 'FRAME',
        children: ['child-1', 'child-2'],
      },
      {
        id: 'child-1',
        name: 'Child1',
        type: 'FRAME',
      },
      {
        id: 'child-2',
        name: 'Child2',
        type: 'RECTANGLE',
      },
    ]

    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.id).toBe('parent-1')
    expect(Array.isArray(rootNode.children)).toBe(true)
    expect(rootNode.children?.length).toBe(2)

    // Children should be linked as objects, not strings
    const child1 = rootNode.children?.[0]
    expect(typeof child1).toBe('object')
    expect((child1 as { id: string })?.id).toBe('child-1')

    const child2 = rootNode.children?.[1]
    expect(typeof child2).toBe('object')
    expect((child2 as { id: string })?.id).toBe('child-2')
  })

  test('should filter out undefined children', () => {
    // Create nodes with children referencing non-existent nodes
    const nodes = [
      {
        id: 'parent-1',
        name: 'Parent',
        type: 'FRAME',
        children: ['child-1', 'non-existent-child'],
      },
      {
        id: 'child-1',
        name: 'Child1',
        type: 'FRAME',
      },
    ]

    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.id).toBe('parent-1')
    expect(Array.isArray(rootNode.children)).toBe(true)
    // Only child-1 should be in children, non-existent-child should be filtered out
    expect(rootNode.children?.length).toBe(1)
    expect((rootNode.children?.[0] as { id: string })?.id).toBe('child-1')
  })

  test('TEXT node getStyledTextSegments should return stored segments', () => {
    // Create TEXT node with styledTextSegments data
    const nodes = [
      {
        id: 'text-1',
        name: 'TextNode',
        type: 'TEXT',
        characters: 'Hello World',
        styledTextSegments: [
          {
            start: 0,
            end: 5,
            characters: 'Hello',
            fontName: { family: 'Arial', style: 'Bold' },
            fontWeight: 700,
            fontSize: 20,
          },
          {
            start: 6,
            end: 11,
            characters: 'World',
            fontName: { family: 'Arial', style: 'Regular' },
            fontWeight: 400,
            fontSize: 16,
          },
        ],
      },
    ]

    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.type).toBe('TEXT')

    // Call getStyledTextSegments
    const getStyledTextSegments = (
      rootNode as unknown as Record<string, unknown>
    ).getStyledTextSegments as () => unknown[]
    expect(typeof getStyledTextSegments).toBe('function')

    const segments = getStyledTextSegments()
    expect(Array.isArray(segments)).toBe(true)
    expect(segments.length).toBe(2)
    expect((segments[0] as { characters: string }).characters).toBe('Hello')
    expect((segments[1] as { characters: string }).characters).toBe('World')
  })

  test('TEXT node getStyledTextSegments should generate default segment when no styledTextSegments', () => {
    // Create TEXT node without styledTextSegments
    const nodes = [
      {
        id: 'text-1',
        name: 'TextNode',
        type: 'TEXT',
        characters: 'Test Text',
        fontName: { family: 'Inter', style: 'Regular' },
        fontWeight: 400,
        fontSize: 14,
        lineHeight: { unit: 'AUTO' },
        letterSpacing: { unit: 'PERCENT', value: 0 },
        fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
      },
    ]

    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.type).toBe('TEXT')

    // Call getStyledTextSegments - should generate default segment
    const getStyledTextSegments = (
      rootNode as unknown as Record<string, unknown>
    ).getStyledTextSegments as () => unknown[]
    const segments = getStyledTextSegments()

    expect(Array.isArray(segments)).toBe(true)
    expect(segments.length).toBe(1)

    const segment = segments[0] as Record<string, unknown>
    expect(segment.characters).toBe('Test Text')
    expect(segment.start).toBe(0)
    expect(segment.end).toBe(9)
    expect(segment.textDecoration).toBe('NONE')
    expect(segment.textCase).toBe('ORIGINAL')
  })

  test('should handle children that are already NodeData objects', () => {
    // Create nodes where children are already objects, not string IDs
    const childNode = {
      id: 'child-1',
      name: 'Child1',
      type: 'FRAME',
    }

    const nodes = [
      {
        id: 'parent-1',
        name: 'Parent',
        type: 'FRAME',
        children: [childNode], // Already an object, not a string ID
      },
      childNode,
    ]

    const rootNode = assembleNodeTree(nodes)

    expect(rootNode.id).toBe('parent-1')
    expect(Array.isArray(rootNode.children)).toBe(true)
    expect(rootNode.children?.length).toBe(1)
    // Child should still be an object
    expect((rootNode.children?.[0] as { id: string })?.id).toBe('child-1')
  })

  test('should fallback to first node when all nodes have parent set', () => {
    // Edge case: all nodes have parent set (e.g., circular or all have parent references)
    const nodes = [
      {
        id: 'node-1',
        name: 'Node1',
        type: 'FRAME',
        parent: { id: 'some-parent', name: 'SomeParent', type: 'FRAME' }, // Has parent set
      },
      {
        id: 'node-2',
        name: 'Node2',
        type: 'FRAME',
        parent: { id: 'another-parent', name: 'AnotherParent', type: 'FRAME' }, // Has parent set
      },
    ]

    const rootNode = assembleNodeTree(nodes)

    // Should fallback to the first node from nodeMap
    expect(rootNode.id).toBe('node-1')
  })
})

describe('setupVariableMocks', () => {
  test('should setup figma.variables.getVariableByIdAsync mock', async () => {
    // Setup globalThis.figma
    ;(globalThis as unknown as { figma: Record<string, unknown> }).figma = {}

    const variables = [
      { id: 'VariableID:123', name: 'test-color' },
      { id: 'VariableID:456', name: 'another-color' },
    ]

    setupVariableMocks(variables)

    const g = globalThis as {
      figma?: {
        variables?: { getVariableByIdAsync?: (id: string) => Promise<unknown> }
      }
    }

    expect(g.figma?.variables?.getVariableByIdAsync).toBeDefined()

    // Test the mock returns correct values
    if (g.figma?.variables?.getVariableByIdAsync) {
      const result1 =
        await g.figma.variables.getVariableByIdAsync('VariableID:123')
      expect(result1).toEqual({ id: 'VariableID:123', name: 'test-color' })

      const result2 =
        await g.figma.variables.getVariableByIdAsync('VariableID:456')
      expect(result2).toEqual({ id: 'VariableID:456', name: 'another-color' })

      // Non-existent variable should return null
      const result3 =
        await g.figma.variables.getVariableByIdAsync('VariableID:789')
      expect(result3).toBeNull()
    }
  })

  test('should fallback to original mock when variable not found', async () => {
    // Setup globalThis.figma with an existing mock
    const originalMock = async (id: string) => {
      if (id === 'VariableID:original') {
        return { id: 'VariableID:original', name: 'original-color' }
      }
      return null
    }

    ;(
      globalThis as unknown as {
        figma: { variables: { getVariableByIdAsync: typeof originalMock } }
      }
    ).figma = {
      variables: {
        getVariableByIdAsync: originalMock,
      },
    }

    // Now call setupVariableMocks with new variables
    const variables = [{ id: 'VariableID:new', name: 'new-color' }]
    setupVariableMocks(variables)

    const g = globalThis as {
      figma?: {
        variables?: { getVariableByIdAsync?: (id: string) => Promise<unknown> }
      }
    }

    // New variable should work
    const result1 =
      await g.figma?.variables?.getVariableByIdAsync?.('VariableID:new')
    expect(result1).toEqual({ id: 'VariableID:new', name: 'new-color' })

    // Original mock should still work via fallback
    const result2 = await g.figma?.variables?.getVariableByIdAsync?.(
      'VariableID:original',
    )
    expect(result2).toEqual({
      id: 'VariableID:original',
      name: 'original-color',
    })
  })
})
