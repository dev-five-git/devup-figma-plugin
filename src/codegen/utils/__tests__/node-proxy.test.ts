import { beforeEach, describe, expect, test } from 'bun:test'
import {
  assembleNodeTree,
  nodeProxyTracker,
  setupVariableMocks,
} from '../node-proxy'

// Mock SceneNode
function createMockNode(overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id: 'test-node-1',
    name: 'TestNode',
    type: 'FRAME',
    width: 100,
    height: 200,
    x: 10,
    y: 20,
    visible: true,
    opacity: 1,
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 }, opacity: 1 }],
    strokes: [],
    strokeWeight: 0,
    cornerRadius: 8,
    layoutMode: 'VERTICAL',
    paddingTop: 10,
    paddingRight: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    ...overrides,
  } as unknown as SceneNode
}

describe('nodeProxyTracker', () => {
  beforeEach(() => {
    nodeProxyTracker.clear()
  })

  test('should track property access', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)

    // Access some properties
    const _width = wrapped.width
    const _height = wrapped.height
    const _name = wrapped.name

    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(1)

    const log = logs[0]
    expect(log.nodeId).toBe('test-node-1')
    expect(log.nodeName).toBe('TestNode')
    expect(log.nodeType).toBe('FRAME')

    const accessedKeys = log.properties.map((p) => p.key)
    expect(accessedKeys).toContain('width')
    expect(accessedKeys).toContain('height')
    expect(accessedKeys).toContain('name')
  })

  test('should serialize complex values', () => {
    const node = createMockNode({
      fills: [
        {
          type: 'SOLID',
          color: { r: 1, g: 0, b: 0 },
          opacity: 0.5,
          visible: true,
        },
      ],
    } as unknown as Partial<SceneNode>)
    const wrapped = nodeProxyTracker.wrap(node)

    const _fills = (wrapped as any).fills

    const log = nodeProxyTracker.getAccessLog('test-node-1')
    const fillsProp = log?.properties.find((p) => p.key === 'fills')

    expect(fillsProp).toBeDefined()
    expect(Array.isArray(fillsProp?.value)).toBe(true)
  })

  test('should deduplicate repeated access', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)

    // Access same property multiple times
    const _w1 = wrapped.width
    const _w2 = wrapped.width
    const _w3 = wrapped.width

    const log = nodeProxyTracker.getAccessLog('test-node-1')
    const widthAccesses = log?.properties.filter((p) => p.key === 'width')

    expect(widthAccesses?.length).toBe(1)
  })

  test('should output JSON format', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)

    const _width = wrapped.width

    const json = nodeProxyTracker.toJSON()
    expect(json['test-node-1']).toBeDefined()
    expect(json['test-node-1'].nodeId).toBe('test-node-1')
  })

  test('should output test case format', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)

    const _width = wrapped.width
    const _height = wrapped.height

    const testCase = nodeProxyTracker.toTestCaseFormat()
    expect(testCase.length).toBe(1)
    expect(testCase[0].id).toBe('test-node-1')
    expect(testCase[0].name).toBe('TestNode')
    expect(testCase[0].type).toBe('FRAME')
    expect(testCase[0].width).toBe(100)
    expect(testCase[0].height).toBe(200)
  })

  test('should clear logs', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)

    const _width = wrapped.width
    expect(nodeProxyTracker.getAllAccessLogs().length).toBe(1)

    nodeProxyTracker.clear()
    expect(nodeProxyTracker.getAllAccessLogs().length).toBe(0)
  })

  test('should exclude functions from tracking', () => {
    const node = createMockNode()
    ;(node as unknown as Record<string, unknown>).someMethod = () => 'result'
    const wrapped = nodeProxyTracker.wrap(node)

    const _method = (wrapped as unknown as Record<string, () => string>)
      .someMethod

    const log = nodeProxyTracker.getAccessLog('test-node-1')
    const methodProp = log?.properties.find((p) => p.key === 'someMethod')

    expect(methodProp).toBeUndefined()
  })

  test('should track multiple nodes separately', () => {
    const node1 = createMockNode({ id: 'node-1', name: 'Node1' })
    const node2 = createMockNode({ id: 'node-2', name: 'Node2' })

    const wrapped1 = nodeProxyTracker.wrap(node1)
    const wrapped2 = nodeProxyTracker.wrap(node2)

    const _w1 = wrapped1.width
    const _h2 = wrapped2.height

    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(2)

    const log1 = nodeProxyTracker.getAccessLog('node-1')
    const log2 = nodeProxyTracker.getAccessLog('node-2')

    expect(log1?.properties.some((p) => p.key === 'width')).toBe(true)
    expect(log2?.properties.some((p) => p.key === 'height')).toBe(true)
  })

  test('should track TEXT node with styledTextSegments when accessed as child', () => {
    // TEXT node with getStyledTextSegments
    const textNode = {
      id: 'text-node-1',
      name: 'TextNode',
      type: 'TEXT',
      characters: 'Hello World',
      fontSize: 16,
      fontName: { family: 'Inter', style: 'Regular' },
      fontWeight: 400,
      lineHeight: { value: 24, unit: 'PIXELS' },
      letterSpacing: { value: 0, unit: 'PIXELS' },
      textAlignHorizontal: 'LEFT',
      textAlignVertical: 'TOP',
      textAutoResize: 'WIDTH_AND_HEIGHT',
      textTruncation: 'DISABLED',
      maxLines: null,
      visible: true,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
      getStyledTextSegments: () => [
        {
          start: 0,
          end: 11,
          characters: 'Hello World',
          fontName: { family: 'Inter', style: 'Regular' },
          fontWeight: 400,
          fontSize: 16,
          textDecoration: 'NONE',
          textCase: 'ORIGINAL',
          lineHeight: { value: 24, unit: 'PIXELS' },
          letterSpacing: { value: 0, unit: 'PIXELS' },
          fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
          textStyleId: '',
          fillStyleId: '',
          listOptions: { type: 'NONE' },
          indentation: 0,
          hyperlink: null,
        },
      ],
    } as unknown as SceneNode

    // Parent frame containing the text node
    const parentNode = {
      ...createMockNode({ id: 'parent-1', name: 'ParentNode' }),
      children: [textNode],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(parentNode)

    // Access children to trigger trackNodeRecursively on the TEXT node
    const _children = (wrapped as unknown as FrameNode).children

    const log = nodeProxyTracker.getAccessLog('text-node-1')
    expect(log).toBeDefined()
    expect(log?.nodeType).toBe('TEXT')

    // Check that styledTextSegments was tracked
    const segmentsProp = log?.properties.find(
      (p) => p.key === 'styledTextSegments',
    )
    expect(segmentsProp).toBeDefined()
    expect(Array.isArray(segmentsProp?.value)).toBe(true)
  })

  test('should track children nodes recursively', () => {
    const childNode = createMockNode({
      id: 'child-1',
      name: 'ChildNode',
      type: 'FRAME',
      width: 50,
      height: 50,
    })

    const parentNode = {
      ...createMockNode({ id: 'parent-1', name: 'ParentNode' }),
      children: [childNode],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(parentNode)

    // Access children to trigger trackNodeRecursively
    const _children = (wrapped as unknown as FrameNode).children

    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(2)

    const parentLog = nodeProxyTracker.getAccessLog('parent-1')
    const childLog = nodeProxyTracker.getAccessLog('child-1')

    expect(parentLog).toBeDefined()
    expect(childLog).toBeDefined()

    // Child should have properties tracked
    expect(childLog?.properties.length).toBeGreaterThan(0)
  })

  test('should return flat node list with toNodeList', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)

    const _width = wrapped.width
    const _height = wrapped.height
    const _name = wrapped.name

    const nodeList = nodeProxyTracker.toNodeList()
    expect(nodeList.length).toBe(1)

    const nodeData = nodeList[0]
    expect(nodeData.id).toBe('test-node-1')
    expect(nodeData.name).toBe('TestNode')
    expect(nodeData.type).toBe('FRAME')
    expect(nodeData.width).toBe(100)
    expect(nodeData.height).toBe(200)
  })

  test('should resolve node references in toNodeList', () => {
    const childNode = createMockNode({
      id: 'child-1',
      name: 'ChildNode',
    })

    const parentNode = {
      ...createMockNode({ id: 'parent-1', name: 'ParentNode' }),
      children: [childNode],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(parentNode)
    const _children = (wrapped as unknown as FrameNode).children

    const nodeList = nodeProxyTracker.toNodeList()
    expect(nodeList.length).toBe(2)

    // Check that node references are resolved to IDs
    const parentData = nodeList.find((n) => n.id === 'parent-1')
    expect(parentData).toBeDefined()
    expect(Array.isArray(parentData?.children)).toBe(true)
  })

  test('should handle filterByRoot with nested children', () => {
    const grandChild = createMockNode({
      id: 'grandchild-1',
      name: 'GrandChild',
      width: 25,
    })

    const childNode = {
      ...createMockNode({
        id: 'child-1',
        name: 'ChildNode',
        width: 50,
      }),
      children: [grandChild],
    } as unknown as SceneNode

    const parentNode = {
      ...createMockNode({ id: 'parent-1', name: 'ParentNode' }),
      children: [childNode],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(parentNode)
    const children = (wrapped as unknown as FrameNode).children
    const _grandChildren = (children[0] as unknown as FrameNode).children

    // All nodes should be tracked
    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(3)

    // Test filterByRoot functionality via toTestCaseFormatWithVariables
    // This accesses the internal filterByRoot which uses collectDescendants
  })

  test('should serialize array-like objects correctly', () => {
    // Test with gradientTransform (array-like object with numeric keys)
    const nodeWithGradient = {
      ...createMockNode({ id: 'gradient-node', name: 'GradientNode' }),
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          gradientTransform: {
            '0': [1, 0, 0],
            '1': [0, 1, 0],
          },
          gradientStops: [
            { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
            { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
          ],
        },
      ],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(nodeWithGradient)
    const _fills = (wrapped as unknown as FrameNode).fills

    const log = nodeProxyTracker.getAccessLog('gradient-node')
    expect(log).toBeDefined()

    const fillsProp = log?.properties.find((p) => p.key === 'fills')
    expect(fillsProp).toBeDefined()
    expect(Array.isArray(fillsProp?.value)).toBe(true)
  })

  test('should track deeply nested children recursively', () => {
    // Create a 3-level deep hierarchy
    const level3 = createMockNode({
      id: 'level-3',
      name: 'Level3',
      type: 'FRAME',
    })

    const level2 = {
      ...createMockNode({
        id: 'level-2',
        name: 'Level2',
        type: 'FRAME',
      }),
      children: [level3],
    } as unknown as SceneNode

    const level1 = {
      ...createMockNode({
        id: 'level-1',
        name: 'Level1',
        type: 'FRAME',
      }),
      children: [level2],
    } as unknown as SceneNode

    const root = {
      ...createMockNode({
        id: 'root',
        name: 'Root',
        type: 'FRAME',
      }),
      children: [level1],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(root)

    // Access children at each level
    const children1 = (wrapped as unknown as FrameNode).children
    const children2 = (children1[0] as unknown as FrameNode).children
    const _children3 = (children2[0] as unknown as FrameNode).children

    // All 4 levels should be tracked
    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(4)

    expect(nodeProxyTracker.getAccessLog('root')).toBeDefined()
    expect(nodeProxyTracker.getAccessLog('level-1')).toBeDefined()
    expect(nodeProxyTracker.getAccessLog('level-2')).toBeDefined()
    expect(nodeProxyTracker.getAccessLog('level-3')).toBeDefined()
  })

  test('toTestCaseFormat should filter nodes by rootId', () => {
    // Create a hierarchy with 3 nodes
    const child = createMockNode({
      id: 'child-1',
      name: 'Child',
      type: 'FRAME',
    })

    const parent = {
      ...createMockNode({
        id: 'parent-1',
        name: 'Parent',
        type: 'FRAME',
      }),
      children: [child],
    } as unknown as SceneNode

    const sibling = createMockNode({
      id: 'sibling-1',
      name: 'Sibling',
      type: 'FRAME',
    })

    // Wrap and access all nodes
    const wrappedParent = nodeProxyTracker.wrap(parent)
    const _children = (wrappedParent as unknown as FrameNode).children
    nodeProxyTracker.wrap(sibling)
    const _siblingWidth = sibling.width

    // All 3 nodes should be tracked
    expect(nodeProxyTracker.getAllAccessLogs().length).toBe(3)

    // Filter by parent-1 should only include parent and child
    const filteredNodes = nodeProxyTracker.toTestCaseFormat('parent-1')
    expect(filteredNodes.length).toBe(2)

    const nodeIds = filteredNodes.map((n) => n.id)
    expect(nodeIds).toContain('parent-1')
    expect(nodeIds).toContain('child-1')
    expect(nodeIds).not.toContain('sibling-1')
  })

  test('toTestCaseFormat should return all nodes when rootId not found', () => {
    const node = createMockNode()
    const wrapped = nodeProxyTracker.wrap(node)
    const _width = wrapped.width

    // Filter by non-existent rootId should return all nodes
    const nodes = nodeProxyTracker.toTestCaseFormat('non-existent-id')
    expect(nodes.length).toBe(1)
  })

  test('toTestCaseFormat should include SECTION parent', () => {
    const child = createMockNode({
      id: 'child-1',
      name: 'Child',
      type: 'FRAME',
    })

    const sectionParent = {
      id: 'section-1',
      name: 'Section',
      type: 'SECTION',
      children: [child],
    } as unknown as SceneNode

    // Add parent reference
    ;(child as unknown as { parent: SceneNode }).parent = sectionParent

    // Wrap and access nodes
    const wrappedSection = nodeProxyTracker.wrap(sectionParent)
    const _children = (wrappedSection as unknown as SectionNode).children

    // Filter by child-1 should include the SECTION parent
    const filteredNodes = nodeProxyTracker.toTestCaseFormat('child-1')
    const nodeTypes = filteredNodes.map((n) => n.type)
    expect(nodeTypes).toContain('FRAME')
    expect(nodeTypes).toContain('SECTION')
  })

  test('toTestCaseFormat handles deeply nested children filtering', () => {
    // Create a deep hierarchy: root -> level1 -> level2 -> level3
    const level3 = createMockNode({
      id: 'level-3',
      name: 'Level3',
      type: 'FRAME',
    })

    const level2 = {
      ...createMockNode({
        id: 'level-2',
        name: 'Level2',
        type: 'FRAME',
      }),
      children: [level3],
    } as unknown as SceneNode

    const level1 = {
      ...createMockNode({
        id: 'level-1',
        name: 'Level1',
        type: 'FRAME',
      }),
      children: [level2],
    } as unknown as SceneNode

    const root = {
      ...createMockNode({
        id: 'root',
        name: 'Root',
        type: 'FRAME',
      }),
      children: [level1],
    } as unknown as SceneNode

    // Track all nodes
    const wrapped = nodeProxyTracker.wrap(root)
    const children1 = (wrapped as unknown as FrameNode).children
    const children2 = (children1[0] as unknown as FrameNode).children
    const _children3 = (children2[0] as unknown as FrameNode).children

    // Filter by level-1 should include level-1, level-2, level-3 but not root
    const filteredNodes = nodeProxyTracker.toTestCaseFormat('level-1')

    const nodeIds = filteredNodes.map((n) => n.id)
    expect(nodeIds).toContain('level-1')
    expect(nodeIds).toContain('level-2')
    expect(nodeIds).toContain('level-3')
    expect(nodeIds).not.toContain('root')
  })

  test('should handle array-like objects in serializeArray', () => {
    // Test serializeArray with isArrayLikeObject and arrayLikeToArray
    // gradientTransform is an array-like object (numeric keys) inside the fills array items
    // To hit arrayLikeToArray, we need the array-like object to be a direct item in an array
    const nodeWithArrayLike = {
      ...createMockNode({ id: 'array-like-node', name: 'ArrayLikeNode' }),
      fills: [
        // The fills array itself has array-like object as item
        {
          '0': 'value0',
          '1': 'value1',
          '2': 'value2',
        },
      ],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(nodeWithArrayLike)
    const _fills = (wrapped as unknown as FrameNode).fills

    const log = nodeProxyTracker.getAccessLog('array-like-node')
    expect(log).toBeDefined()

    const fillsProp = log?.properties.find((p) => p.key === 'fills')
    expect(fillsProp).toBeDefined()

    // Check that array-like object is converted to array
    const fills = fillsProp?.value as unknown[]
    expect(Array.isArray(fills)).toBe(true)

    // The first item should now be an array ['value0', 'value1', 'value2']
    expect(Array.isArray(fills[0])).toBe(true)
    expect(fills[0]).toEqual(['value0', 'value1', 'value2'])
  })

  test('toTestCaseFormatWithVariables should collect variable info from fills', async () => {
    // Setup figma global mock
    const mockFigma = {
      variables: {
        getVariableByIdAsync: async (id: string) => {
          if (id === 'VariableID:123') {
            return { id: 'VariableID:123', name: 'primary-color' }
          }
          return null
        },
      },
    }
    ;(globalThis as unknown as { figma: typeof mockFigma }).figma = mockFigma

    // Create a node with boundVariables referencing a variable
    const nodeWithVariable = {
      ...createMockNode({ id: 'node-1', name: 'NodeWithVariable' }),
      fills: [
        {
          type: 'SOLID',
          color: { r: 1, g: 0, b: 0 },
          boundVariables: {
            color: '[NodeId: VariableID:123]',
          },
        },
      ],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(nodeWithVariable)

    // Access fills to trigger tracking
    const _fills = (wrapped as unknown as FrameNode).fills

    // Call toTestCaseFormatWithVariables
    const result = await nodeProxyTracker.toTestCaseFormatWithVariables()

    expect(result.nodes.length).toBe(1)
    expect(result.variables.length).toBe(1)
    expect(result.variables[0].id).toBe('VariableID:123')
    expect(result.variables[0].name).toBe('primary-color')
  })

  test('toTestCaseFormatWithVariables should collect variables from nested objects', async () => {
    // Setup figma global mock
    const mockFigma = {
      variables: {
        getVariableByIdAsync: async (id: string) => {
          if (id === 'VariableID:nested') {
            return { id: 'VariableID:nested', name: 'nested-color' }
          }
          return null
        },
      },
    }
    ;(globalThis as unknown as { figma: typeof mockFigma }).figma = mockFigma

    // Create a node with nested object containing variable reference
    const nodeWithNestedVariable = {
      ...createMockNode({ id: 'node-nested', name: 'NodeWithNestedVariable' }),
      customProp: {
        nested: {
          deep: {
            variableRef: '[NodeId: VariableID:nested]',
          },
        },
      },
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(nodeWithNestedVariable)

    // Access customProp to trigger tracking
    const _customProp = (wrapped as unknown as Record<string, unknown>)
      .customProp

    // Call toTestCaseFormatWithVariables
    const result = await nodeProxyTracker.toTestCaseFormatWithVariables()

    expect(result.variables.length).toBe(1)
    expect(result.variables[0].id).toBe('VariableID:nested')
    expect(result.variables[0].name).toBe('nested-color')
  })

  test('toTestCaseFormatWithVariables should collect variables from arrays', async () => {
    // Setup figma global mock
    const mockFigma = {
      variables: {
        getVariableByIdAsync: async (id: string) => {
          if (id === 'VariableID:arr1') {
            return { id: 'VariableID:arr1', name: 'arr-color-1' }
          }
          if (id === 'VariableID:arr2') {
            return { id: 'VariableID:arr2', name: 'arr-color-2' }
          }
          return null
        },
      },
    }
    ;(globalThis as unknown as { figma: typeof mockFigma }).figma = mockFigma

    // Create a node with array containing variable references
    const nodeWithArrayVariable = {
      ...createMockNode({ id: 'node-arr', name: 'NodeWithArrayVariable' }),
      fills: [
        {
          type: 'SOLID',
          boundVariables: {
            color: '[NodeId: VariableID:arr1]',
          },
        },
        {
          type: 'SOLID',
          boundVariables: {
            color: '[NodeId: VariableID:arr2]',
          },
        },
      ],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(nodeWithArrayVariable)

    // Access fills to trigger tracking
    const _fills = (wrapped as unknown as FrameNode).fills

    // Call toTestCaseFormatWithVariables
    const result = await nodeProxyTracker.toTestCaseFormatWithVariables()

    expect(result.variables.length).toBe(2)
    const varIds = result.variables.map((v) => v.id)
    expect(varIds).toContain('VariableID:arr1')
    expect(varIds).toContain('VariableID:arr2')
  })

  test('toTestCaseFormatWithVariables should collect variables from direct array of variable refs', async () => {
    // Setup figma global mock
    const mockFigma = {
      variables: {
        getVariableByIdAsync: async (id: string) => {
          if (id === 'VariableID:direct') {
            return { id: 'VariableID:direct', name: 'direct-color' }
          }
          return null
        },
      },
    }
    ;(globalThis as unknown as { figma: typeof mockFigma }).figma = mockFigma

    // Create a node with direct array of variable reference strings
    const nodeWithDirectArray = {
      ...createMockNode({ id: 'node-direct', name: 'NodeWithDirectArray' }),
      colorRefs: ['[NodeId: VariableID:direct]'],
    } as unknown as SceneNode

    const wrapped = nodeProxyTracker.wrap(nodeWithDirectArray)

    // Access colorRefs to trigger tracking
    const _colorRefs = (wrapped as unknown as Record<string, unknown>).colorRefs

    // Call toTestCaseFormatWithVariables
    const result = await nodeProxyTracker.toTestCaseFormatWithVariables()

    expect(result.variables.length).toBe(1)
    expect(result.variables[0].id).toBe('VariableID:direct')
  })

  test('trackTree should track all nodes without Proxy overhead', () => {
    const childNode = createMockNode({
      id: 'child-1',
      name: 'ChildNode',
      type: 'FRAME',
      width: 50,
      height: 50,
    })

    const parentNode = {
      ...createMockNode({ id: 'parent-1', name: 'ParentNode' }),
      children: [childNode],
    } as unknown as SceneNode

    nodeProxyTracker.trackTree(parentNode)

    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(2)

    const parentLog = nodeProxyTracker.getAccessLog('parent-1')
    const childLog = nodeProxyTracker.getAccessLog('child-1')

    expect(parentLog).toBeDefined()
    expect(childLog).toBeDefined()

    // Parent should have children serialized as node ID references
    const childrenProp = parentLog?.properties.find((p) => p.key === 'children')
    expect(childrenProp).toBeDefined()
    expect(Array.isArray(childrenProp?.value)).toBe(true)
    expect((childrenProp?.value as string[])[0]).toBe('[NodeId: child-1]')

    // Child should have properties tracked
    expect(childLog?.properties.length).toBeGreaterThan(0)
    expect(childLog?.properties.some((p) => p.key === 'width')).toBe(true)
  })

  test('trackTree should track TEXT nodes with styledTextSegments', () => {
    const textNode = {
      id: 'text-node-1',
      name: 'TextNode',
      type: 'TEXT',
      characters: 'Hello World',
      fontSize: 16,
      fontName: { family: 'Inter', style: 'Regular' },
      fontWeight: 400,
      visible: true,
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
      getStyledTextSegments: () => [
        {
          start: 0,
          end: 11,
          characters: 'Hello World',
          fontName: { family: 'Inter', style: 'Regular' },
          fontWeight: 400,
          fontSize: 16,
          textDecoration: 'NONE',
          textCase: 'ORIGINAL',
          lineHeight: { value: 24, unit: 'PIXELS' },
          letterSpacing: { value: 0, unit: 'PIXELS' },
          fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
          textStyleId: '',
          fillStyleId: '',
          listOptions: { type: 'NONE' },
          indentation: 0,
          hyperlink: null,
        },
      ],
    } as unknown as SceneNode

    const parentNode = {
      ...createMockNode({ id: 'parent-1', name: 'ParentNode' }),
      children: [textNode],
    } as unknown as SceneNode

    nodeProxyTracker.trackTree(parentNode)

    const log = nodeProxyTracker.getAccessLog('text-node-1')
    expect(log).toBeDefined()
    expect(log?.nodeType).toBe('TEXT')

    // Check that styledTextSegments was tracked
    const segmentsProp = log?.properties.find(
      (p) => p.key === 'styledTextSegments',
    )
    expect(segmentsProp).toBeDefined()
    expect(Array.isArray(segmentsProp?.value)).toBe(true)
  })

  test('trackTree should skip already-tracked nodes', () => {
    const node = createMockNode({ id: 'node-1', name: 'Node1' })

    // Track twice
    nodeProxyTracker.trackTree(node)
    nodeProxyTracker.trackTree(node)

    // Should still only have one log entry
    const logs = nodeProxyTracker.getAllAccessLogs()
    expect(logs.length).toBe(1)
  })

  test('re-exported assembleNodeTree works from node-proxy', () => {
    const nodes = [{ id: 'test-1', name: 'Test', type: 'FRAME' }]
    const result = assembleNodeTree(nodes)
    expect(result.id).toBe('test-1')
  })

  test('re-exported setupVariableMocks works from node-proxy', async () => {
    ;(globalThis as unknown as { figma: Record<string, unknown> }).figma = {}
    setupVariableMocks([{ id: 'VariableID:test', name: 'test-var' }])

    const g = globalThis as {
      figma?: {
        variables?: { getVariableByIdAsync?: (id: string) => Promise<unknown> }
      }
    }
    const result =
      await g.figma?.variables?.getVariableByIdAsync?.('VariableID:test')
    expect(result).toEqual({ id: 'VariableID:test', name: 'test-var' })
  })
})
