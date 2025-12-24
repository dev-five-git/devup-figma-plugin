import { afterAll, describe, expect, test } from 'bun:test'
import { Codegen } from '../Codegen'
import { ResponsiveCodegen } from '../responsive/ResponsiveCodegen'

// Mock figma global
;(globalThis as { figma?: unknown }).figma = {
  mixed: Symbol('mixed'),
  util: {
    rgba: (color: string | RGB | RGBA): RGBA => {
      if (typeof color === 'string') {
        const rgbMatch = color.match(/rgb\(([^)]+)\)/)
        if (rgbMatch) {
          const values = rgbMatch[1].split(/[,\s/]+/).filter(Boolean)
          const r = values[0]?.includes('%')
            ? parseFloat(values[0]) / 100
            : parseFloat(values[0] || '0') / 255
          const g = values[1]?.includes('%')
            ? parseFloat(values[1]) / 100
            : parseFloat(values[1] || '0') / 255
          const b = values[2]?.includes('%')
            ? parseFloat(values[2]) / 100
            : parseFloat(values[2] || '0') / 255
          const a = values[3] ? parseFloat(values[3]) : 1
          return { r, g, b, a }
        }
        return { r: 0, g: 0, b: 0, a: 1 }
      }
      if (typeof color === 'object') {
        if ('a' in color) {
          return color
        }
        return { ...color, a: 1 }
      }
      return { r: 0, g: 0, b: 0, a: 1 }
    },
  },
  getLocalTextStylesAsync: () => [],
  getStyleByIdAsync: async () => null,
  getNodeByIdAsync: async () => null,
  variables: {
    getVariableByIdAsync: async () => null,
  },
} as unknown as typeof figma

afterAll(() => {
  ;(globalThis as { figma?: unknown }).figma = undefined
})

function createComponentNode(
  name: string,
  variantProperties: Record<string, string>,
  overrides: Partial<ComponentNode> = {},
): ComponentNode {
  return {
    type: 'COMPONENT',
    name,
    variantProperties,
    children: [],
    layoutMode: 'VERTICAL',
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    itemSpacing: 0,
    width: 100,
    height: 100,
    visible: true,
    fills: [],
    strokes: [],
    effects: [],
    cornerRadius: 0,
    reactions: [],
    ...overrides,
  } as unknown as ComponentNode
}

function createComponentSetNode(
  name: string,
  componentPropertyDefinitions: ComponentSetNode['componentPropertyDefinitions'],
  children: ComponentNode[],
): ComponentSetNode {
  return {
    type: 'COMPONENT_SET',
    name,
    componentPropertyDefinitions,
    children,
    defaultVariant: children[0],
    width: 500,
    height: 500,
    visible: true,
    fills: [],
    strokes: [],
    effects: [],
    reactions: [],
  } as unknown as ComponentSetNode
}

describe('Codegen viewport variant', () => {
  test('hasViewportVariant returns false for non-COMPONENT_SET', () => {
    const frameNode = {
      type: 'FRAME',
      name: 'Frame',
      children: [],
    } as unknown as SceneNode

    const codegen = new Codegen(frameNode)
    expect(codegen.hasViewportVariant()).toBe(false)
  })

  test('hasViewportVariant returns false when no viewport variant exists', () => {
    const componentSet = createComponentSetNode(
      'Button',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'md',
          variantOptions: ['sm', 'md', 'lg'],
        },
      },
      [createComponentNode('size=md', { size: 'md' })],
    )

    const codegen = new Codegen(componentSet)
    expect(codegen.hasViewportVariant()).toBe(false)
  })

  test('hasViewportVariant returns true when viewport variant exists (lowercase)', () => {
    const componentSet = createComponentSetNode(
      'Button',
      {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'tablet', 'desktop'],
        },
      },
      [createComponentNode('viewport=desktop', { viewport: 'desktop' })],
    )

    const codegen = new Codegen(componentSet)
    expect(codegen.hasViewportVariant()).toBe(true)
  })

  test('hasViewportVariant returns true when viewport variant exists (mixed case)', () => {
    const componentSet = createComponentSetNode(
      'Button',
      {
        Viewport: {
          type: 'VARIANT',
          defaultValue: 'Desktop',
          variantOptions: ['Mobile', 'Tablet', 'Desktop'],
        },
      },
      [createComponentNode('Viewport=Desktop', { Viewport: 'Desktop' })],
    )

    const codegen = new Codegen(componentSet)
    expect(codegen.hasViewportVariant()).toBe(true)
  })

  test('generateViewportResponsiveComponents generates responsive code for viewport variants', async () => {
    const mobileComponent = createComponentNode(
      'viewport=mobile',
      { viewport: 'mobile' },
      {
        width: 320,
        layoutMode: 'VERTICAL',
        itemSpacing: 8,
      },
    )

    const desktopComponent = createComponentNode(
      'viewport=desktop',
      { viewport: 'desktop' },
      {
        width: 1200,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 16,
      },
    )

    const componentSet = createComponentSetNode(
      'ResponsiveCard',
      {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      [mobileComponent, desktopComponent],
    )

    const codegen = new Codegen(componentSet)
    expect(codegen.hasViewportVariant()).toBe(true)

    const codes = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'ResponsiveCard',
    )
    expect(codes.length).toBe(1)
    expect(codes[0][0]).toBe('ResponsiveCard')
    expect(codes[0][1]).toContain('export function ResponsiveCard')
  })

  test('generateViewportResponsiveComponents excludes viewport from variants interface', async () => {
    const mobileComponent = createComponentNode('size=md, viewport=mobile', {
      size: 'md',
      viewport: 'mobile',
    })

    const desktopComponent = createComponentNode('size=md, viewport=desktop', {
      size: 'md',
      viewport: 'desktop',
    })

    const componentSet = createComponentSetNode(
      'Button',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'md',
          variantOptions: ['sm', 'md', 'lg'],
        },
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      [mobileComponent, desktopComponent],
    )

    const codes = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'Button',
    )

    expect(codes.length).toBe(1)
    // Should have size in interface but not viewport
    expect(codes[0][1]).toContain('size:')
    expect(codes[0][1]).not.toContain('viewport:')
  })

  test('generateViewportResponsiveComponents generates responsive arrays for different props', async () => {
    const mobileComponent = createComponentNode(
      'viewport=mobile',
      { viewport: 'mobile' },
      {
        width: 320,
        height: 200,
        layoutMode: 'VERTICAL',
        itemSpacing: 8,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 8,
        paddingRight: 8,
      },
    )

    const desktopComponent = createComponentNode(
      'viewport=desktop',
      { viewport: 'desktop' },
      {
        width: 1200,
        height: 400,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 24,
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 16,
        paddingRight: 16,
      },
    )

    const componentSet = createComponentSetNode(
      'ResponsiveBox',
      {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      [mobileComponent, desktopComponent],
    )

    const codes = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'ResponsiveBox',
    )

    expect(codes.length).toBe(1)
    const generatedCode = codes[0][1]

    // Check that responsive arrays are generated for different prop values
    // padding should be responsive: p={["8px", null, null, null, "16px"]}
    expect(generatedCode).toContain('p={')
    expect(generatedCode).toContain('"8px"')
    expect(generatedCode).toContain('"16px"')
  })

  test('groups components with same non-viewport variants together', async () => {
    // Create components for different size + viewport combinations
    const smMobile = createComponentNode(
      'size=sm, viewport=mobile',
      { size: 'sm', viewport: 'mobile' },
      { width: 80 },
    )

    const smDesktop = createComponentNode(
      'size=sm, viewport=desktop',
      { size: 'sm', viewport: 'desktop' },
      { width: 100 },
    )

    const lgMobile = createComponentNode(
      'size=lg, viewport=mobile',
      { size: 'lg', viewport: 'mobile' },
      { width: 120 },
    )

    const lgDesktop = createComponentNode(
      'size=lg, viewport=desktop',
      { size: 'lg', viewport: 'desktop' },
      { width: 160 },
    )

    const componentSet = createComponentSetNode(
      'Button',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'sm',
          variantOptions: ['sm', 'lg'],
        },
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      [smMobile, smDesktop, lgMobile, lgDesktop],
    )

    const codes = await ResponsiveCodegen.generateViewportResponsiveComponents(
      componentSet,
      'Button',
    )

    // Should generate 2 groups: one for size=sm and one for size=lg
    // But since we're using the same component name, it will be 2 entries
    expect(codes.length).toBe(2)
  })
})
