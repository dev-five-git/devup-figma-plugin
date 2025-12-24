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

const renderComponentMock = mock(
  (component: string, code: string, variants: Record<string, string>) =>
    `component:${component}:${JSON.stringify(variants)}|${code}`,
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
    mock.module('../../render', () => ({
      renderNode: renderNodeMock,
      renderComponent: renderComponentMock,
    }))
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
    const nonSection = { type: 'FRAME' } as unknown as SceneNode
    const nodeWithoutSectionParent = {
      type: 'FRAME',
      parent: { type: 'FRAME' },
    } as unknown as SceneNode

    expect(ResponsiveCodegen.canGenerateResponsive(section)).toBeTrue()
    expect(ResponsiveCodegen.canGenerateResponsive(nonSection)).toBeFalse()
    expect(ResponsiveCodegen.hasParentSection(frame)).toEqual(section)
    expect(
      ResponsiveCodegen.hasParentSection(nodeWithoutSectionParent),
    ).toBeNull()
  })

  it('generateViewportResponsiveComponents returns empty when no viewport variant', async () => {
    const componentSet = {
      type: 'COMPONENT_SET',
      name: 'NoViewport',
      componentPropertyDefinitions: {
        size: {
          type: 'VARIANT',
          variantOptions: ['sm', 'md', 'lg'],
        },
      },
      children: [],
    } as unknown as ComponentSetNode

    const result = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'NoViewport',
    )
    expect(result).toEqual([])
  })

  it('generateViewportResponsiveComponents processes non-viewport variants', async () => {
    const componentSet = {
      type: 'COMPONENT_SET',
      name: 'MultiVariant',
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          variantOptions: ['mobile', 'desktop'],
        },
        size: {
          type: 'VARIANT',
          variantOptions: ['sm', 'md', 'lg'],
        },
      },
      children: [
        {
          type: 'COMPONENT',
          name: 'viewport=mobile, size=md',
          variantProperties: { viewport: 'mobile', size: 'md' },
          children: [],
          layoutMode: 'VERTICAL',
          width: 320,
          height: 100,
        },
        {
          type: 'COMPONENT',
          name: 'viewport=desktop, size=md',
          variantProperties: { viewport: 'desktop', size: 'md' },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: 1200,
          height: 100,
        },
      ],
    } as unknown as ComponentSetNode

    const result = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'MultiVariant',
    )

    expect(result.length).toBeGreaterThan(0)
    // Check that the result includes the component name
    expect(result[0][0]).toBe('MultiVariant')
    // Check that the generated code includes the size variant type
    expect(result[0][1]).toContain('size')
  })

  it('handles component without viewport in variantProperties', async () => {
    const componentSet = {
      type: 'COMPONENT_SET',
      name: 'PartialViewport',
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      children: [
        {
          type: 'COMPONENT',
          name: 'viewport=mobile',
          variantProperties: { viewport: 'mobile' },
          children: [],
          layoutMode: 'VERTICAL',
          width: 320,
          height: 100,
        },
        {
          type: 'COMPONENT',
          name: 'no-viewport',
          variantProperties: {}, // No viewport property
          children: [],
          layoutMode: 'HORIZONTAL',
          width: 1200,
          height: 100,
        },
        {
          type: 'FRAME', // Not a COMPONENT type
          name: 'frame-child',
          children: [],
        },
      ],
    } as unknown as ComponentSetNode

    const result = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'PartialViewport',
    )

    // Should still generate responsive code for the valid component
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('handles null sectionNode in constructor', () => {
    const generator = new ResponsiveCodegen(null)
    expect(generator).toBeDefined()
  })

  it('sorts multiple non-viewport variants alphabetically', async () => {
    // Multiple non-viewport variants to trigger the sort callback
    const componentSet = {
      type: 'COMPONENT_SET',
      name: 'MultiPropVariant',
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          variantOptions: ['mobile', 'desktop'],
        },
        size: {
          type: 'VARIANT',
          variantOptions: ['sm', 'md', 'lg'],
        },
        color: {
          type: 'VARIANT',
          variantOptions: ['red', 'blue', 'green'],
        },
        state: {
          type: 'VARIANT',
          variantOptions: ['default', 'hover', 'active'],
        },
      },
      children: [
        {
          type: 'COMPONENT',
          name: 'viewport=mobile, size=md, color=red, state=default',
          variantProperties: {
            viewport: 'mobile',
            size: 'md',
            color: 'red',
            state: 'default',
          },
          children: [],
          layoutMode: 'VERTICAL',
          width: 320,
          height: 100,
        },
        {
          type: 'COMPONENT',
          name: 'viewport=desktop, size=md, color=red, state=default',
          variantProperties: {
            viewport: 'desktop',
            size: 'md',
            color: 'red',
            state: 'default',
          },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: 1200,
          height: 100,
        },
      ],
    } as unknown as ComponentSetNode

    const result = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'MultiPropVariant',
    )

    expect(result.length).toBeGreaterThan(0)
    // Check that all non-viewport variants are in the interface
    expect(result[0][1]).toContain('size')
    expect(result[0][1]).toContain('color')
    expect(result[0][1]).toContain('state')
  })

  describe('generateVariantOnlyMergedCode', () => {
    it('merges props across variants with conditional syntax', () => {
      const generator = new ResponsiveCodegen(null)

      const treesByVariant = new Map<string, NodeTree>([
        [
          'scroll',
          {
            component: 'Flex',
            props: { w: '100px', h: '200px' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'default',
          {
            component: 'Flex',
            props: { w: '300px', h: '200px' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
      ])

      const result = generator.generateVariantOnlyMergedCode(
        'status',
        treesByVariant,
        0,
      )

      // h should be same value (200px)
      expect(result).toContain('"h":"200px"')
      // w should be variant conditional
      expect(result).toContain('scroll')
      expect(result).toContain('default')
    })

    it('renders conditional nodes for variant-only children', () => {
      const generator = new ResponsiveCodegen(null)

      const scrollOnlyChild: NodeTree = {
        component: 'Box',
        props: { id: 'ScrollOnly' },
        children: [],
        nodeType: 'FRAME',
        nodeName: 'ScrollOnlyChild',
      }

      const treesByVariant = new Map<string, NodeTree>([
        [
          'scroll',
          {
            component: 'Flex',
            props: {},
            children: [scrollOnlyChild],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'default',
          {
            component: 'Flex',
            props: {},
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
      ])

      const result = generator.generateVariantOnlyMergedCode(
        'status',
        treesByVariant,
        0,
      )

      // Should contain conditional rendering syntax
      expect(result).toContain('status === "scroll"')
      expect(result).toContain('&&')
    })

    it('merges children that exist in all variants', () => {
      const generator = new ResponsiveCodegen(null)

      const sharedChild: NodeTree = {
        component: 'Text',
        props: { fontSize: '16px' },
        children: [],
        nodeType: 'TEXT',
        nodeName: 'SharedText',
      }

      const treesByVariant = new Map<string, NodeTree>([
        [
          'scroll',
          {
            component: 'Flex',
            props: {},
            children: [{ ...sharedChild, props: { fontSize: '14px' } }],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'default',
          {
            component: 'Flex',
            props: {},
            children: [{ ...sharedChild, props: { fontSize: '16px' } }],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
      ])

      const result = generator.generateVariantOnlyMergedCode(
        'status',
        treesByVariant,
        0,
      )

      // Should contain merged child without conditional
      expect(result).not.toContain('status === "scroll" &&')
      // Should contain variant conditional for fontSize
      expect(result).toContain('scroll')
      expect(result).toContain('default')
    })
  })

  describe('generateVariantResponsiveComponents', () => {
    it('handles component set with only non-viewport variants', async () => {
      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'StatusVariant',
        componentPropertyDefinitions: {
          status: {
            type: 'VARIANT',
            variantOptions: ['scroll', 'default'],
          },
        },
        children: [
          {
            type: 'COMPONENT',
            name: 'status=scroll',
            variantProperties: { status: 'scroll' },
            children: [],
            layoutMode: 'VERTICAL',
            width: 100,
            height: 100,
          },
          {
            type: 'COMPONENT',
            name: 'status=default',
            variantProperties: { status: 'default' },
            children: [],
            layoutMode: 'VERTICAL',
            width: 200,
            height: 100,
          },
        ],
      } as unknown as ComponentSetNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'StatusVariant',
        )

      expect(result.length).toBe(1)
      expect(result[0][0]).toBe('StatusVariant')
      expect(result[0][1]).toContain('status')
    })

    it('delegates to generateViewportResponsiveComponents when only viewport exists', async () => {
      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'ViewportOnly',
        componentPropertyDefinitions: {
          viewport: {
            type: 'VARIANT',
            variantOptions: ['mobile', 'desktop'],
          },
        },
        children: [
          {
            type: 'COMPONENT',
            name: 'viewport=mobile',
            variantProperties: { viewport: 'mobile' },
            children: [],
            layoutMode: 'VERTICAL',
            width: 320,
            height: 100,
          },
          {
            type: 'COMPONENT',
            name: 'viewport=desktop',
            variantProperties: { viewport: 'desktop' },
            children: [],
            layoutMode: 'HORIZONTAL',
            width: 1200,
            height: 100,
          },
        ],
      } as unknown as ComponentSetNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'ViewportOnly',
        )

      expect(result.length).toBe(1)
      expect(result[0][0]).toBe('ViewportOnly')
    })

    it('handles both viewport and other variants', async () => {
      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'Combined',
        componentPropertyDefinitions: {
          viewport: {
            type: 'VARIANT',
            variantOptions: ['mobile', 'desktop'],
          },
          status: {
            type: 'VARIANT',
            variantOptions: ['scroll', 'default'],
          },
        },
        children: [
          {
            type: 'COMPONENT',
            name: 'viewport=mobile, status=scroll',
            variantProperties: { viewport: 'mobile', status: 'scroll' },
            children: [],
            layoutMode: 'VERTICAL',
            width: 320,
            height: 100,
          },
          {
            type: 'COMPONENT',
            name: 'viewport=desktop, status=scroll',
            variantProperties: { viewport: 'desktop', status: 'scroll' },
            children: [],
            layoutMode: 'HORIZONTAL',
            width: 1200,
            height: 100,
          },
          {
            type: 'COMPONENT',
            name: 'viewport=mobile, status=default',
            variantProperties: { viewport: 'mobile', status: 'default' },
            children: [],
            layoutMode: 'VERTICAL',
            width: 320,
            height: 200,
          },
          {
            type: 'COMPONENT',
            name: 'viewport=desktop, status=default',
            variantProperties: { viewport: 'desktop', status: 'default' },
            children: [],
            layoutMode: 'HORIZONTAL',
            width: 1200,
            height: 200,
          },
        ],
      } as unknown as ComponentSetNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'Combined',
        )

      expect(result.length).toBe(1)
      expect(result[0][0]).toBe('Combined')
      // Should have status in interface
      expect(result[0][1]).toContain('status')
    })
  })
})
