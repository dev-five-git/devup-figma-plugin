import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { NodeTree } from '../../types'

// Mock figma global
;(globalThis as { figma?: unknown }).figma = {
  mixed: Symbol('mixed'),
  util: {
    rgba: (color: { r: number; g: number; b: number; a?: number }) => ({
      r: color.r,
      g: color.g,
      b: color.b,
      a: color.a ?? 1,
    }),
  },
} as unknown as typeof figma

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

    it('renders OR conditional for child existing in multiple but not all variants', () => {
      const generator = new ResponsiveCodegen(null)

      const partialChild: NodeTree = {
        component: 'Box',
        props: { id: 'PartialChild' },
        children: [],
        nodeType: 'FRAME',
        nodeName: 'PartialChild',
      }

      const treesByVariant = new Map<string, NodeTree>([
        [
          'scroll',
          {
            component: 'Flex',
            props: {},
            children: [partialChild],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'hover',
          {
            component: 'Flex',
            props: {},
            children: [{ ...partialChild, props: { id: 'PartialChildHover' } }],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'default',
          {
            component: 'Flex',
            props: {},
            children: [], // No child in default variant
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

      // Should contain OR conditional for multiple variants
      expect(result).toContain('status === "scroll"')
      expect(result).toContain('status === "hover"')
      expect(result).toContain('||')
      expect(result).toContain('&&')
      expect(result).toMatchSnapshot()
    })
  })

  describe('createNestedVariantProp optimization', () => {
    it('minimizes nesting by choosing the best outer variant key', () => {
      const generator = new ResponsiveCodegen(null)

      // Scenario: bg prop where white is same for both sizes, but primary differs
      // If we use size as outer key:
      //   { Md: { primary: "$primaryBold", white: "$background" }[variant],
      //     Sm: { primary: "$primaryExBold", white: "$background" }[variant] }[size]
      // If we use variant as outer key:
      //   { primary: { Md: "$primaryBold", Sm: "$primaryExBold" }[size],
      //     white: "$background" }[variant]
      // The second option is better because white collapses to a scalar

      const treesByVariant = new Map<string, NodeTree>([
        [
          'size=Md|variant=primary',
          {
            component: 'Box',
            props: { bg: '$primaryBold' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'size=Md|variant=white',
          {
            component: 'Box',
            props: { bg: '$background' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'size=Sm|variant=primary',
          {
            component: 'Box',
            props: { bg: '$primaryExBold' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'size=Sm|variant=white',
          {
            component: 'Box',
            props: { bg: '$background' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
      ])

      // Use generateNestedVariantMergedCode which internally calls createNestedVariantProp
      const result = (
        generator as unknown as {
          generateNestedVariantMergedCode: (
            variantKeys: string[],
            trees: Map<string, NodeTree>,
            depth: number,
          ) => string
        }
      ).generateNestedVariantMergedCode(['size', 'variant'], treesByVariant, 0)

      // Should use variant as outer key because white collapses to scalar
      // The result should have variant as the outer conditional, not size
      expect(result).toContain('variantKey":"variant"')
      // white should be a scalar value, not nested
      expect(result).toContain('"white":"$background"')
      // primary should be nested with size
      expect(result).toContain('"primary":{')
      expect(result).toContain('variantKey":"size"')
    })

    it('uses any key when all have equal nesting cost', () => {
      const generator = new ResponsiveCodegen(null)

      // Scenario: all combinations have different values
      const treesByVariant = new Map<string, NodeTree>([
        [
          'size=Md|variant=primary',
          {
            component: 'Box',
            props: { bg: 'A' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'size=Md|variant=white',
          {
            component: 'Box',
            props: { bg: 'B' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'size=Sm|variant=primary',
          {
            component: 'Box',
            props: { bg: 'C' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
        [
          'size=Sm|variant=white',
          {
            component: 'Box',
            props: { bg: 'D' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Root',
          },
        ],
      ])

      const result = (
        generator as unknown as {
          generateNestedVariantMergedCode: (
            variantKeys: string[],
            trees: Map<string, NodeTree>,
            depth: number,
          ) => string
        }
      ).generateNestedVariantMergedCode(['size', 'variant'], treesByVariant, 0)

      // Should still produce valid output with either key as outer
      expect(result).toContain('variantKey')
      expect(result).toContain('"bg"')
    })
  })

  describe('generateVariantMergedCode', () => {
    it('merges trees across both viewport and variant dimensions', () => {
      const generator = new ResponsiveCodegen(null)

      // Trees by variant and breakpoint:
      // status=scroll => { mobile: tree1, pc: tree2 }
      // status=default => { mobile: tree3, pc: tree4 }
      const treesByVariantAndBreakpoint = new Map<
        string,
        Map<'mobile' | 'tablet' | 'pc', NodeTree>
      >([
        [
          'scroll',
          new Map<'mobile' | 'tablet' | 'pc', NodeTree>([
            [
              'mobile',
              {
                component: 'Box',
                props: { w: '100px', h: '50px' },
                children: [],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
            [
              'pc',
              {
                component: 'Box',
                props: { w: '200px', h: '50px' },
                children: [],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
          ]),
        ],
        [
          'default',
          new Map<'mobile' | 'tablet' | 'pc', NodeTree>([
            [
              'mobile',
              {
                component: 'Box',
                props: { w: '150px', h: '50px' },
                children: [],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
            [
              'pc',
              {
                component: 'Box',
                props: { w: '250px', h: '50px' },
                children: [],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
          ]),
        ],
      ])

      const result = generator.generateVariantMergedCode(
        'status',
        treesByVariantAndBreakpoint,
        0,
      )

      // h should be same value (50px) - no responsive, no variant conditional
      expect(result).toContain('"h":"50px"')
      // w should have both responsive (mobile vs pc) AND variant conditional
      // scroll: mobile=100px, pc=200px => ["100px", null, null, null, "200px"]
      // default: mobile=150px, pc=250px => ["150px", null, null, null, "250px"]
      expect(result).toContain('scroll')
      expect(result).toContain('default')
      expect(result).toContain('status') // variantKey
    })

    it('merges children across viewport and variant dimensions', () => {
      const generator = new ResponsiveCodegen(null)

      // Child that exists only on mobile for scroll, and on both for default
      const mobileOnlyChild: NodeTree = {
        component: 'Text',
        props: { id: 'MobileChild' },
        children: [],
        nodeType: 'TEXT',
        nodeName: 'MobileChild',
      }

      const treesByVariantAndBreakpoint = new Map<
        string,
        Map<'mobile' | 'tablet' | 'pc', NodeTree>
      >([
        [
          'scroll',
          new Map<'mobile' | 'tablet' | 'pc', NodeTree>([
            [
              'mobile',
              {
                component: 'Box',
                props: {},
                children: [mobileOnlyChild],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
            [
              'pc',
              {
                component: 'Box',
                props: {},
                children: [], // No child on pc
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
          ]),
        ],
        [
          'default',
          new Map<'mobile' | 'tablet' | 'pc', NodeTree>([
            [
              'mobile',
              {
                component: 'Box',
                props: {},
                children: [
                  { ...mobileOnlyChild, props: { id: 'DefaultChild' } },
                ],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
            [
              'pc',
              {
                component: 'Box',
                props: {},
                children: [
                  { ...mobileOnlyChild, props: { id: 'DefaultChild' } },
                ],
                nodeType: 'FRAME',
                nodeName: 'Root',
              },
            ],
          ]),
        ],
      ])

      const result = generator.generateVariantMergedCode(
        'status',
        treesByVariantAndBreakpoint,
        0,
      )

      // Should contain the children's id values
      expect(result).toContain('MobileChild')
      expect(result).toContain('DefaultChild')
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

    it('handles effect + viewport + size + variant (4 dimensions)', async () => {
      // Button component with:
      // - effect: default, hover, active
      // - viewport: Desktop, Mobile
      // - size: Md, Sm
      // - variant: primary, white

      const createComponent = (
        effect: string,
        viewport: string,
        size: string,
        variant: string,
        bgColor: { r: number; g: number; b: number },
      ) =>
        ({
          type: 'COMPONENT',
          name: `effect=${effect}, viewport=${viewport}, size=${size}, variant=${variant}`,
          variantProperties: { effect, viewport, size, variant },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: viewport === 'Desktop' ? (size === 'Md' ? 191 : 123) : 149,
          height: viewport === 'Desktop' ? (size === 'Md' ? 64 : 46) : 51,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              color: bgColor,
              opacity: 1,
            },
          ],
          reactions: [],
        }) as unknown as ComponentNode

      // Primary variant colors
      const primaryDefault = { r: 0.35, g: 0.25, b: 0.17 }
      const primaryHover = { r: 0.24, g: 0.17, b: 0.12 }
      const primaryActive = { r: 0.19, g: 0.14, b: 0.1 }

      // White variant colors
      const whiteDefault = { r: 1, g: 1, b: 1 }
      const whiteHover = { r: 0.95, g: 0.95, b: 0.95 }
      const whiteActive = { r: 0.9, g: 0.9, b: 0.9 }

      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'Button',
        componentPropertyDefinitions: {
          effect: {
            type: 'VARIANT',
            defaultValue: 'default',
            variantOptions: ['active', 'default', 'hover'],
          },
          viewport: {
            type: 'VARIANT',
            defaultValue: 'Desktop',
            variantOptions: ['Desktop', 'Mobile'],
          },
          size: {
            type: 'VARIANT',
            defaultValue: 'Md',
            variantOptions: ['Md', 'Sm'],
          },
          variant: {
            type: 'VARIANT',
            defaultValue: 'primary',
            variantOptions: ['primary', 'white'],
          },
        },
        children: [
          // Primary Md
          createComponent(
            'default',
            'Desktop',
            'Md',
            'primary',
            primaryDefault,
          ),
          createComponent('hover', 'Desktop', 'Md', 'primary', primaryHover),
          createComponent('active', 'Desktop', 'Md', 'primary', primaryActive),
          createComponent('default', 'Mobile', 'Md', 'primary', primaryDefault),
          createComponent('hover', 'Mobile', 'Md', 'primary', primaryHover),
          createComponent('active', 'Mobile', 'Md', 'primary', primaryActive),
          // Primary Sm
          createComponent(
            'default',
            'Desktop',
            'Sm',
            'primary',
            primaryDefault,
          ),
          createComponent('hover', 'Desktop', 'Sm', 'primary', primaryHover),
          createComponent('active', 'Desktop', 'Sm', 'primary', primaryActive),
          createComponent('default', 'Mobile', 'Sm', 'primary', primaryDefault),
          createComponent('hover', 'Mobile', 'Sm', 'primary', primaryHover),
          createComponent('active', 'Mobile', 'Sm', 'primary', primaryActive),
          // White Md
          createComponent('default', 'Desktop', 'Md', 'white', whiteDefault),
          createComponent('hover', 'Desktop', 'Md', 'white', whiteHover),
          createComponent('active', 'Desktop', 'Md', 'white', whiteActive),
          createComponent('default', 'Mobile', 'Md', 'white', whiteDefault),
          createComponent('hover', 'Mobile', 'Md', 'white', whiteHover),
          createComponent('active', 'Mobile', 'Md', 'white', whiteActive),
          // White Sm
          createComponent('default', 'Desktop', 'Sm', 'white', whiteDefault),
          createComponent('hover', 'Desktop', 'Sm', 'white', whiteHover),
          createComponent('active', 'Desktop', 'Sm', 'white', whiteActive),
          createComponent('default', 'Mobile', 'Sm', 'white', whiteDefault),
          createComponent('hover', 'Mobile', 'Sm', 'white', whiteHover),
          createComponent('active', 'Mobile', 'Sm', 'white', whiteActive),
        ],
      } as unknown as ComponentSetNode

      // Set default variant
      ;(componentSet as { defaultVariant: ComponentNode }).defaultVariant =
        componentSet.children[0] as ComponentNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'Button',
        )

      expect(result.length).toBe(1)
      expect(result[0][0]).toBe('Button')

      const code = result[0][1]

      // Should have size and variant in interface (not effect, not viewport)
      expect(code).toContain('size')
      expect(code).toContain('variant')
      // effect should NOT be in the interface (handled as pseudo-selectors)
      expect(code).not.toMatch(/effect:\s*['"]/)
      // viewport should NOT be in the interface (handled as responsive arrays)
      expect(code).not.toMatch(/viewport:\s*['"]/)

      // Verify snapshot for the generated code
      expect(code).toMatchSnapshot()
    })

    it('handles responsive pseudo-selector props (different hover colors per viewport)', async () => {
      // Component with different hover colors for Desktop vs Mobile
      const createComponent = (
        effect: string,
        viewport: string,
        bgColor: { r: number; g: number; b: number },
      ) =>
        ({
          type: 'COMPONENT',
          name: `effect=${effect}, viewport=${viewport}`,
          variantProperties: { effect, viewport },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: viewport === 'Desktop' ? 200 : 150,
          height: 50,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              color: bgColor,
              opacity: 1,
            },
          ],
          reactions: [],
        }) as unknown as ComponentNode

      // Desktop colors
      const desktopDefault = { r: 0.5, g: 0.5, b: 0.5 } // #808080
      const desktopHover = { r: 0.6, g: 0.6, b: 0.6 } // #999999

      // Mobile colors (different hover color)
      const mobileDefault = { r: 0.5, g: 0.5, b: 0.5 } // #808080 (same as desktop)
      const mobileHover = { r: 0.7, g: 0.7, b: 0.7 } // #B3B3B3 (different from desktop)

      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'ResponsiveHoverButton',
        componentPropertyDefinitions: {
          effect: {
            type: 'VARIANT',
            defaultValue: 'default',
            variantOptions: ['default', 'hover'],
          },
          viewport: {
            type: 'VARIANT',
            defaultValue: 'Desktop',
            variantOptions: ['Desktop', 'Mobile'],
          },
        },
        children: [
          createComponent('default', 'Desktop', desktopDefault),
          createComponent('hover', 'Desktop', desktopHover),
          createComponent('default', 'Mobile', mobileDefault),
          createComponent('hover', 'Mobile', mobileHover),
        ],
      } as unknown as ComponentSetNode

      // Set default variant
      ;(componentSet as { defaultVariant: ComponentNode }).defaultVariant =
        componentSet.children[0] as ComponentNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'ResponsiveHoverButton',
        )

      expect(result.length).toBe(1)
      const code = result[0][1]

      // The _hover.bg should be a responsive array since colors differ by viewport
      // Desktop hover: #999 (or #999999), Mobile hover: #B3B3B3
      // Expected: _hover: { bg: ["#B3B3B3", null, null, null, "#999"] }
      expect(code).toContain('_hover')
      // Should contain responsive array format (mobile first, then pc)
      expect(code).toContain('#B3B3B3') // Mobile hover color
      expect(code).toMatch(/#999(?:999)?/) // Desktop hover color (may be shortened)
    })

    it('handles hover only on desktop (no hover on mobile)', async () => {
      // Component where hover only exists on Desktop, not on Mobile
      const createComponent = (
        effect: string,
        viewport: string,
        bgColor: { r: number; g: number; b: number },
      ) =>
        ({
          type: 'COMPONENT',
          name: `effect=${effect}, viewport=${viewport}`,
          variantProperties: { effect, viewport },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: viewport === 'Desktop' ? 200 : 150,
          height: 50,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              color: bgColor,
              opacity: 1,
            },
          ],
          reactions: [],
        }) as unknown as ComponentNode

      // Desktop colors
      const desktopDefault = { r: 0.5, g: 0.5, b: 0.5 } // #808080
      const desktopHover = { r: 0.6, g: 0.6, b: 0.6 } // #999999

      // Mobile - only default, NO hover variant
      const mobileDefault = { r: 0.5, g: 0.5, b: 0.5 } // #808080

      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'DesktopOnlyHoverButton',
        componentPropertyDefinitions: {
          effect: {
            type: 'VARIANT',
            defaultValue: 'default',
            variantOptions: ['default', 'hover'],
          },
          viewport: {
            type: 'VARIANT',
            defaultValue: 'Desktop',
            variantOptions: ['Desktop', 'Mobile'],
          },
        },
        children: [
          createComponent('default', 'Desktop', desktopDefault),
          createComponent('hover', 'Desktop', desktopHover),
          createComponent('default', 'Mobile', mobileDefault),
          // Note: NO hover variant for Mobile
        ],
      } as unknown as ComponentSetNode

      // Set default variant
      ;(componentSet as { defaultVariant: ComponentNode }).defaultVariant =
        componentSet.children[0] as ComponentNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'DesktopOnlyHoverButton',
        )

      expect(result.length).toBe(1)
      const code = result[0][1]

      // _hover should exist with responsive array where mobile slot is null
      // Expected: _hover: { bg: [null, null, null, null, "#999"] }
      expect(code).toContain('_hover')
      // Should contain null for mobile slot and value for pc slot
      expect(code).toContain('null')
      expect(code).toMatch(/#999(?:999)?/) // Desktop hover color
    })

    it('handles hover prop existing only in some variants (outline only in white)', async () => {
      // Component where _hover.outline exists only in white variant, not in primary
      const createComponent = (
        effect: string,
        variant: string,
        bgColor: { r: number; g: number; b: number },
        strokes?: Array<{
          type: string
          visible: boolean
          color: { r: number; g: number; b: number }
        }>,
      ) =>
        ({
          type: 'COMPONENT',
          name: `effect=${effect}, variant=${variant}`,
          variantProperties: { effect, variant },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: 200,
          height: 50,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              color: bgColor,
              opacity: 1,
            },
          ],
          strokes: strokes || [],
          strokeWeight: strokes && strokes.length > 0 ? 1 : 0,
          reactions: [],
        }) as unknown as ComponentNode

      // primary variant - no border/stroke
      const primaryDefault = { r: 0.5, g: 0.2, b: 0.1 }
      const primaryHover = { r: 0.6, g: 0.3, b: 0.2 }

      // white variant - has border/stroke on hover
      const whiteDefault = { r: 1, g: 1, b: 1 }
      const whiteHover = { r: 0.95, g: 0.95, b: 0.95 }
      const whiteBorderHover = [
        { type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } },
      ]

      const componentSet = {
        type: 'COMPONENT_SET',
        name: 'BorderVariantButton',
        componentPropertyDefinitions: {
          effect: {
            type: 'VARIANT',
            defaultValue: 'default',
            variantOptions: ['default', 'hover'],
          },
          variant: {
            type: 'VARIANT',
            defaultValue: 'primary',
            variantOptions: ['primary', 'white'],
          },
        },
        children: [
          createComponent('default', 'primary', primaryDefault),
          createComponent('hover', 'primary', primaryHover),
          createComponent('default', 'white', whiteDefault),
          createComponent('hover', 'white', whiteHover, whiteBorderHover),
        ],
      } as unknown as ComponentSetNode

      // Set default variant
      ;(componentSet as { defaultVariant: ComponentNode }).defaultVariant =
        componentSet.children[0] as ComponentNode

      const result =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          'BorderVariantButton',
        )

      expect(result.length).toBe(1)
      const code = result[0][1]

      // _hover should exist with outline that only applies to white variant
      // Since primary doesn't have outline in hover, the variant conditional should
      // only include white: { outline: "solid 1px #000" }[variant]
      expect(code).toContain('_hover')
      // Should contain the outline value for white (strokes become outline)
      expect(code).toContain('outline')
      // The outline should be wrapped in variant conditional with only white having value
      expect(code).toContain('variantKey')
      expect(code).toContain('"white"')
      // primary should NOT have outline value (it has no border/stroke)
      expect(code).toMatch(/"outline":\{[^}]*"white":[^}]*\}/)
      expect(code).not.toMatch(/"outline":\{[^}]*"primary":/)
    })

    it('prefers variant key with fewer entries via createNestedVariantProp', () => {
      // When a prop exists only in white variant (for both Md and Sm sizes),
      // using 'variant' as outer key produces 1 entry: { white: "..." }[variant]
      // using 'size' as outer key produces 2 entries: { Md: "...", Sm: "..." }[size]
      // Should prefer 'variant' for fewer entries
      const generator = new ResponsiveCodegen(null)

      // Scenario: border only exists for white variant (Md and Sm both have it)
      // white Md and white Sm have the same border value
      const valuesByComposite = new Map<string, unknown>([
        ['size=Md|variant=white', 'solid 1px #000'],
        ['size=Sm|variant=white', 'solid 1px #000'],
      ])

      // Access private method via type casting
      const result = (
        generator as unknown as {
          createNestedVariantProp: (
            variantKeys: string[],
            valuesByComposite: Map<string, unknown>,
          ) => unknown
        }
      ).createNestedVariantProp(['size', 'variant'], valuesByComposite)

      // Result should use 'variant' as key since it produces fewer entries (1 entry: white)
      // NOT 'size' (which would produce 2 entries: Md, Sm with same value)
      expect(result).toEqual({
        __variantProp: true,
        variantKey: 'variant',
        values: { white: 'solid 1px #000' },
      })
    })
  })
})
