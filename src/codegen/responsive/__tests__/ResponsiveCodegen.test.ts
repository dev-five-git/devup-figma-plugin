import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { BREAKPOINT_ORDER, type BreakpointKey } from '../index'

const getPropsMock = mock(async (node: SceneNode) => ({ id: node.name }))
const renderNodeMock = mock(
  (
    component: string,
    props: Record<string, unknown>,
    depth: number,
    children: string[],
  ) =>
    `render:${component}:depth=${depth}:${JSON.stringify(props)}|${children.join(';')}`,
)
const getDevupComponentByNodeMock = mock(() => 'Box')

describe('ResponsiveCodegen', () => {
  let ResponsiveCodegen: typeof import('../ResponsiveCodegen').ResponsiveCodegen

  beforeEach(async () => {
    mock.module('../../props', () => ({ getProps: getPropsMock }))
    mock.module('../../render', () => ({ renderNode: renderNodeMock }))
    mock.module('../../utils/get-devup-component', () => ({
      getDevupComponentByNode: getDevupComponentByNodeMock,
    }))

    ;({ ResponsiveCodegen } = await import('../ResponsiveCodegen'))
    getPropsMock.mockClear()
    renderNodeMock.mockClear()
    getDevupComponentByNodeMock.mockClear()
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

  it('falls back to single breakpoint generation', async () => {
    const child = makeNode('mobile', 320, [makeNode('leaf', undefined, [])])
    const section = {
      type: 'SECTION',
      children: [child],
    } as unknown as SectionNode

    const generator = new ResponsiveCodegen(section)
    const nodeCode = await (
      generator as unknown as {
        generateNodeCode: (node: SceneNode, depth: number) => Promise<string>
      }
    ).generateNodeCode(child, 0)
    expect(renderNodeMock).toHaveBeenCalled()

    const result = await generator.generateResponsiveCode()

    expect(result.startsWith('render:Box')).toBeTrue()
    expect(nodeCode.startsWith('render:Box')).toBeTrue()
  })

  it('merges breakpoints and adds display for missing child variants', async () => {
    const onlyMobile = makeNode('OnlyMobile')
    const sharedMobile = makeNode('Shared')
    const sharedTablet = makeNode('Shared')

    const mobileRoot = makeNode('RootMobile', 320, [onlyMobile, sharedMobile])
    const tabletRoot = makeNode('RootTablet', 1000, [sharedTablet])
    const section = {
      type: 'SECTION',
      children: [mobileRoot, tabletRoot],
    } as unknown as SectionNode

    const generator = new ResponsiveCodegen(section)
    const result = await generator.generateResponsiveCode()

    expect(getPropsMock).toHaveBeenCalled()
    expect(renderNodeMock.mock.calls.length).toBeGreaterThan(0)
    expect(result.startsWith('render:Box')).toBeTrue()
  })

  it('returns empty display when all breakpoints present', async () => {
    const section = {
      type: 'SECTION',
      children: [makeNode('RootMobile', 320)],
    } as unknown as SectionNode
    const generator = new ResponsiveCodegen(section)
    const displayProps = (
      generator as unknown as {
        getDisplayProps: (
          present: Set<BreakpointKey>,
          all: Set<BreakpointKey>,
        ) => Record<string, unknown>
      }
    ).getDisplayProps(
      new Set<BreakpointKey>(BREAKPOINT_ORDER),
      new Set<BreakpointKey>(BREAKPOINT_ORDER),
    )
    expect(displayProps).toEqual({})
  })

  it('recursively generates node code', async () => {
    const child = makeNode('child')
    const parent = makeNode('parent', undefined, [child])
    const section = {
      type: 'SECTION',
      children: [parent],
    } as unknown as SectionNode
    const generator = new ResponsiveCodegen(section)
    const nodeCode = await (
      generator as unknown as {
        generateNodeCode: (node: SceneNode, depth: number) => Promise<string>
      }
    ).generateNodeCode(parent, 0)
    expect(nodeCode.startsWith('render:Box')).toBeTrue()
    expect(renderNodeMock).toHaveBeenCalled()
  })

  it('static helpers detect section and parent section', () => {
    const section = { type: 'SECTION' } as unknown as SectionNode
    const frame = { type: 'FRAME', parent: section } as unknown as SceneNode
    expect(ResponsiveCodegen.canGenerateResponsive(section)).toBeTrue()
    expect(ResponsiveCodegen.hasParentSection(frame)).toEqual(section)
  })
})
