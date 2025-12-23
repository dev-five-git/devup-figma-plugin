import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { NodeTree } from '../../types'

const renderNodeMock = mock(
  (
    component: string,
    props: Record<string, unknown>,
    depth: number,
    children: string[],
  ) =>
    `render:${component}:depth=${depth}:${JSON.stringify(props)}|${children.join(';')}`,
)

// Mock Codegen class
const mockGetTree = mock(
  async (): Promise<NodeTree> => ({
    component: 'Box',
    props: { id: 'test' },
    children: [],
    nodeType: 'FRAME',
    nodeName: 'test',
  }),
)

const mockRenderTree = mock((tree: NodeTree, depth: number) =>
  renderNodeMock(tree.component, tree.props, depth, []),
)

const MockCodegen = class {
  getTree = mockGetTree
  static renderTree = mockRenderTree
}

describe('ResponsiveCodegen', () => {
  let ResponsiveCodegen: typeof import('../ResponsiveCodegen').ResponsiveCodegen

  beforeEach(async () => {
    mock.module('../../render', () => ({ renderNode: renderNodeMock }))
    mock.module('../../Codegen', () => ({ Codegen: MockCodegen }))

    ;({ ResponsiveCodegen } = await import('../ResponsiveCodegen'))
    renderNodeMock.mockClear()
    mockGetTree.mockClear()
    mockRenderTree.mockClear()
  })

  afterEach(() => {
    mock.restore()
  })

  const makeNode = (
    name: string,
    width?: number,
    children: SceneNode[] = [],
    type: SceneNode['type'] = 'FRAME',
  ) => {
    const node: Record<string, unknown> = { name, children, type }
    if (typeof width === 'number') {
      node.width = width
    }
    return node as unknown as SceneNode
  }

  it('returns message when no responsive variants exist', async () => {
    const section = {
      type: 'SECTION',
      children: [makeNode('no-width', undefined, [])],
    } as unknown as SectionNode

    const generator = new ResponsiveCodegen(section)
    const result = await generator.generateResponsiveCode()

    expect(result).toBe('// No responsive variants found in section')
  })

  it('falls back to single breakpoint generation using Codegen', async () => {
    const child = makeNode('mobile', 320, [makeNode('leaf', undefined, [])])
    const section = {
      type: 'SECTION',
      children: [child],
    } as unknown as SectionNode

    const generator = new ResponsiveCodegen(section)
    const result = await generator.generateResponsiveCode()

    expect(mockGetTree).toHaveBeenCalled()
    expect(mockRenderTree).toHaveBeenCalled()
    expect(result.startsWith('render:Box')).toBeTrue()
  })

  it('merges breakpoints and adds display for missing child variants', async () => {
    const onlyMobileChild: NodeTree = {
      component: 'Box',
      props: { id: 'OnlyMobile' },
      children: [],
      nodeType: 'FRAME',
      nodeName: 'OnlyMobile',
    }
    const sharedChild: NodeTree = {
      component: 'Box',
      props: { id: 'Shared' },
      children: [],
      nodeType: 'FRAME',
      nodeName: 'Shared',
    }

    // Mock different trees for different breakpoints
    let callCount = 0
    mockGetTree.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        // Mobile tree
        return {
          component: 'Box',
          props: { id: 'RootMobile' },
          children: [onlyMobileChild, sharedChild],
          nodeType: 'FRAME',
          nodeName: 'RootMobile',
        }
      }
      // Tablet tree
      return {
        component: 'Box',
        props: { id: 'RootTablet' },
        children: [{ ...sharedChild }],
        nodeType: 'FRAME',
        nodeName: 'RootTablet',
      }
    })

    const mobileRoot = makeNode('RootMobile', 320, [])
    const tabletRoot = makeNode('RootTablet', 1000, [])
    const section = {
      type: 'SECTION',
      children: [mobileRoot, tabletRoot],
    } as unknown as SectionNode

    const generator = new ResponsiveCodegen(section)
    const result = await generator.generateResponsiveCode()

    expect(mockGetTree).toHaveBeenCalledTimes(2)
    expect(renderNodeMock.mock.calls.length).toBeGreaterThan(0)
    expect(result.startsWith('render:Box')).toBeTrue()
  })

  it('uses Codegen.renderTree for single breakpoint', async () => {
    const child = makeNode('child', 320)
    const section = {
      type: 'SECTION',
      children: [child],
    } as unknown as SectionNode

    const generator = new ResponsiveCodegen(section)
    await generator.generateResponsiveCode()

    expect(mockGetTree).toHaveBeenCalled()
    expect(mockRenderTree).toHaveBeenCalled()
  })

  it('static helpers detect section and parent section', () => {
    const section = { type: 'SECTION' } as unknown as SectionNode
    const frame = { type: 'FRAME', parent: section } as unknown as SceneNode
    expect(ResponsiveCodegen.canGenerateResponsive(section)).toBeTrue()
    expect(ResponsiveCodegen.hasParentSection(frame)).toEqual(section)
  })
})
