import { beforeEach, describe, expect, test } from 'bun:test'
import { nodeProxyTracker } from '../node-proxy'

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
})
