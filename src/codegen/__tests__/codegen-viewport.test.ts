import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { resetTextStyleCache } from '../../utils'
import { Codegen, resetGlobalBuildTreeCache } from '../Codegen'
import { resetGetPropsCache } from '../props'
import { resetSelectorPropsCache } from '../props/selector'
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

beforeEach(() => {
  resetGlobalBuildTreeCache()
  resetGetPropsCache()
  resetSelectorPropsCache()
  resetTextStyleCache()
})

afterAll(() => {
  resetGlobalBuildTreeCache()
  resetGetPropsCache()
  resetSelectorPropsCache()
  resetTextStyleCache()
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

describe('Codegen effect-only COMPONENT_SET', () => {
  test('generates code with pseudo-selectors for effect-only component set', async () => {
    // Create effect variants: default, hover, active, disabled
    const defaultVariant = createComponentNode(
      'effect=default',
      { effect: 'default' },
      {
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.5, g: 0.3, b: 0.9 },
            opacity: 1,
          } as unknown as Paint,
        ],
        reactions: [
          {
            trigger: { type: 'ON_HOVER' },
            actions: [
              {
                type: 'NODE',
                transition: {
                  type: 'SMART_ANIMATE',
                  duration: 0.3,
                  easing: { type: 'EASE_OUT' },
                },
              },
            ],
          },
        ] as unknown as Reaction[],
      },
    )

    const hoverVariant = createComponentNode(
      'effect=hover',
      { effect: 'hover' },
      {
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.4, g: 0.2, b: 0.8 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const activeVariant = createComponentNode(
      'effect=active',
      { effect: 'active' },
      {
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.3, g: 0.1, b: 0.7 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const disabledVariant = createComponentNode(
      'effect=disabled',
      { effect: 'disabled' },
      {
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.8, g: 0.8, b: 0.8 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const componentSet = createComponentSetNode(
      'EffectButton',
      {
        effect: {
          type: 'VARIANT',
          defaultValue: 'default',
          variantOptions: ['default', 'hover', 'active', 'disabled'],
        },
      },
      [defaultVariant, hoverVariant, activeVariant, disabledVariant],
    )

    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'EffectButton',
    )

    expect(codes.length).toBe(1)
    const [componentName, generatedCode] = codes[0]
    expect(componentName).toBe('EffectButton')

    // Should have pseudo-selector props
    expect(generatedCode).toContain('_hover')
    expect(generatedCode).toContain('_active')
    expect(generatedCode).toContain('_disabled')

    // Should have transition properties
    expect(generatedCode).toContain('transition=')
    expect(generatedCode).toContain('transitionProperty=')

    // Should NOT have effect as a prop (handled via pseudo-selectors)
    expect(generatedCode).not.toContain('effect:')
  })

  test('generates code with viewport + effect variants', async () => {
    // Mobile variants
    const mobileDefault = createComponentNode(
      'effect=default, viewport=Mobile',
      { effect: 'default', viewport: 'Mobile' },
      {
        width: 150,
        height: 50,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.5, g: 0.5, b: 0.5 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const mobileHover = createComponentNode(
      'effect=hover, viewport=Mobile',
      { effect: 'hover', viewport: 'Mobile' },
      {
        width: 150,
        height: 50,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.6, g: 0.6, b: 0.6 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    // Desktop variants
    const desktopDefault = createComponentNode(
      'effect=default, viewport=Desktop',
      { effect: 'default', viewport: 'Desktop' },
      {
        width: 200,
        height: 50,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.5, g: 0.5, b: 0.5 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const desktopHover = createComponentNode(
      'effect=hover, viewport=Desktop',
      { effect: 'hover', viewport: 'Desktop' },
      {
        width: 200,
        height: 50,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.7, g: 0.7, b: 0.7 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const componentSet = createComponentSetNode(
      'ResponsiveEffectButton',
      {
        effect: {
          type: 'VARIANT',
          defaultValue: 'default',
          variantOptions: ['default', 'hover'],
        },
        viewport: {
          type: 'VARIANT',
          defaultValue: 'Desktop',
          variantOptions: ['Mobile', 'Desktop'],
        },
      },
      [mobileDefault, mobileHover, desktopDefault, desktopHover],
    )

    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'ResponsiveEffectButton',
    )

    expect(codes.length).toBe(1)
    const [componentName, generatedCode] = codes[0]
    expect(componentName).toBe('ResponsiveEffectButton')

    // Should have responsive width (different for mobile vs desktop)
    expect(generatedCode).toContain('w={')
    expect(generatedCode).toContain('"150px"')
    expect(generatedCode).toContain('"200px"')

    // Should have _hover with responsive bg colors
    expect(generatedCode).toContain('_hover')
  })

  test('generates code with effect + size variants', async () => {
    // Size=Md variants
    const mdDefault = createComponentNode(
      'effect=default, size=Md',
      { effect: 'default', size: 'Md' },
      {
        width: 100,
        height: 50,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.2, g: 0.4, b: 0.8 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const mdHover = createComponentNode(
      'effect=hover, size=Md',
      { effect: 'hover', size: 'Md' },
      {
        width: 100,
        height: 50,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.3, g: 0.5, b: 0.9 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    // Size=Sm variants
    const smDefault = createComponentNode(
      'effect=default, size=Sm',
      { effect: 'default', size: 'Sm' },
      {
        width: 80,
        height: 40,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.2, g: 0.4, b: 0.8 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const smHover = createComponentNode(
      'effect=hover, size=Sm',
      { effect: 'hover', size: 'Sm' },
      {
        width: 80,
        height: 40,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.3, g: 0.5, b: 0.9 },
            opacity: 1,
          } as unknown as Paint,
        ],
      },
    )

    const componentSet = createComponentSetNode(
      'SizeEffectButton',
      {
        effect: {
          type: 'VARIANT',
          defaultValue: 'default',
          variantOptions: ['default', 'hover'],
        },
        size: {
          type: 'VARIANT',
          defaultValue: 'Md',
          variantOptions: ['Md', 'Sm'],
        },
      },
      [mdDefault, mdHover, smDefault, smHover],
    )

    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'SizeEffectButton',
    )

    expect(codes.length).toBe(1)
    const [componentName, generatedCode] = codes[0]
    expect(componentName).toBe('SizeEffectButton')

    // Should have size prop in interface
    expect(generatedCode).toContain("size: 'Md' | 'Sm'")

    // Should have variant-conditional width
    expect(generatedCode).toContain('w={')
    expect(generatedCode).toContain('[size]')

    // Should have _hover props
    expect(generatedCode).toContain('_hover')
  })

  test('generates BOOLEAN conditions on children in multi-variant ComponentSet', async () => {
    // Simulates a ComponentSet with:
    //   - size: lg, tag (VARIANT)
    //   - varient: primary, white (VARIANT)
    //   - leftIcon: boolean (BOOLEAN) — controls Icon child visibility
    //
    // Icon child exists in lg+primary and lg+white (with leftIcon condition)
    // but NOT in tag variants. This is a BOOLEAN-controlled partial child.

    function createFrameChild(
      id: string,
      name: string,
      overrides: Record<string, unknown> = {},
    ): SceneNode {
      return {
        type: 'FRAME',
        id,
        name,
        visible: true,
        children: [],
        fills: [],
        strokes: [],
        effects: [],
        reactions: [],
        width: 20,
        height: 20,
        layoutMode: 'NONE',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        ...overrides,
      } as unknown as SceneNode
    }

    // lg+primary (has Icon child with BOOLEAN condition + Label child)
    const lgPrimary = createComponentNode(
      'size=lg, varient=primary',
      { size: 'lg', varient: 'primary' },
      {
        id: 'lg-primary',
        children: [
          createFrameChild('icon-lg-p', 'Icon', {
            componentPropertyReferences: { visible: 'leftIcon#70:100' },
          }),
          createFrameChild('label-lg-p', 'Label'),
        ] as unknown as readonly SceneNode[],
        layoutMode: 'HORIZONTAL',
        itemSpacing: 10,
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 10,
        paddingBottom: 10,
      },
    )

    // lg+white (has Icon child with BOOLEAN condition + Label child)
    const lgWhite = createComponentNode(
      'size=lg, varient=white',
      { size: 'lg', varient: 'white' },
      {
        id: 'lg-white',
        children: [
          createFrameChild('icon-lg-w', 'Icon', {
            componentPropertyReferences: { visible: 'leftIcon#70:100' },
          }),
          createFrameChild('label-lg-w', 'Label'),
        ] as unknown as readonly SceneNode[],
        layoutMode: 'HORIZONTAL',
        itemSpacing: 10,
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 10,
        paddingBottom: 10,
      },
    )

    // tag+primary (NO Icon, just Label)
    const tagPrimary = createComponentNode(
      'size=tag, varient=primary',
      { size: 'tag', varient: 'primary' },
      {
        id: 'tag-primary',
        children: [
          createFrameChild('label-tag-p', 'Label'),
        ] as unknown as readonly SceneNode[],
        layoutMode: 'HORIZONTAL',
        itemSpacing: 0,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 6,
        paddingBottom: 6,
      },
    )

    // tag+white (NO Icon, just Label)
    const tagWhite = createComponentNode(
      'size=tag, varient=white',
      { size: 'tag', varient: 'white' },
      {
        id: 'tag-white',
        children: [
          createFrameChild('label-tag-w', 'Label'),
        ] as unknown as readonly SceneNode[],
        layoutMode: 'HORIZONTAL',
        itemSpacing: 0,
        paddingLeft: 10,
        paddingRight: 10,
        paddingTop: 6,
        paddingBottom: 6,
      },
    )

    const allChildren = [lgPrimary, lgWhite, tagPrimary, tagWhite]

    const componentSet = createComponentSetNode(
      'Button',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'lg',
          variantOptions: ['lg', 'tag'],
        },
        varient: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: ['primary', 'white'],
        },
        'leftIcon#70:100': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
      },
      allChildren,
    )

    // Set parent references (critical for addComponentTree to find BOOLEAN properties)
    for (const child of allChildren) {
      ;(child as unknown as { parent: ComponentSetNode }).parent = componentSet
      if ('children' in child && child.children) {
        for (const grandchild of child.children) {
          ;(grandchild as unknown as { parent: SceneNode }).parent = child
        }
      }
    }

    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'Button',
    )

    expect(codes.length).toBe(1)
    const [, generatedCode] = codes[0]

    // Should have leftIcon as a boolean prop
    expect(generatedCode).toContain('leftIcon?: boolean')

    // Icon child should have BOOLEAN condition prepended before variant condition
    // The icon exists in lg+primary and lg+white but NOT tag variants
    // So it should render as: {leftIcon && size === "lg" && <Box .../>}
    expect(generatedCode).toMatch(/leftIcon\s*&&/)
  })

  test('generates BOOLEAN conditions on INSTANCE asset children in multi-variant ComponentSet', async () => {
    // Mirrors the real Figma Button structure where:
    //   - size: lg, md, sm, tag (VARIANT)
    //   - varient: primary, white (VARIANT)
    //   - leftIcon: boolean (BOOLEAN) — controls MypageIcon child visibility
    //   - rightIcon: boolean (BOOLEAN) — controls Arrow child visibility
    //
    // MypageIcon and Arrow are INSTANCE children classified as SVG assets.
    // They exist in lg, md, sm variants but NOT tag variants.

    function createInstanceChild(
      id: string,
      name: string,
      overrides: Record<string, unknown> = {},
    ): SceneNode {
      return {
        type: 'INSTANCE',
        id,
        name,
        visible: true,
        children: [
          {
            type: 'VECTOR',
            id: `${id}-vec`,
            name: `${name}Vector`,
            visible: true,
            isAsset: true,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 1, g: 1, b: 1 },
                opacity: 1,
              },
            ],
            strokes: [],
            effects: [],
            reactions: [],
          },
        ],
        fills: [],
        strokes: [],
        effects: [],
        reactions: [],
        isAsset: true,
        width: 20,
        height: 20,
        ...overrides,
      } as unknown as SceneNode
    }

    function createTextChild(
      id: string,
      name: string,
      text: string,
      overrides: Record<string, unknown> = {},
    ): SceneNode {
      return {
        type: 'TEXT',
        id,
        name,
        visible: true,
        characters: text,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 1, b: 1 },
            opacity: 1,
          },
        ],
        strokes: [],
        effects: [],
        reactions: [],
        width: 50,
        height: 20,
        fontSize: 16,
        fontName: { family: 'Pretendard', style: 'Bold' },
        fontWeight: 600,
        textAlignHorizontal: 'LEFT',
        textAlignVertical: 'CENTER',
        letterSpacing: { value: -2, unit: 'PERCENT' },
        lineHeight: { unit: 'AUTO' },
        textAutoResize: 'WIDTH_AND_HEIGHT',
        textStyleId: '',
        getStyledTextSegments: () => [
          {
            characters: text,
            start: 0,
            end: text.length,
            fontSize: 16,
            fontName: { family: 'Pretendard', style: 'Bold' },
            fontWeight: 600,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 1, g: 1, b: 1 },
                opacity: 1,
              },
            ],
            textDecoration: 'NONE',
            textCase: 'ORIGINAL',
            lineHeight: { unit: 'AUTO' },
            letterSpacing: { value: -2, unit: 'PERCENT' },
            textStyleId: '',
            fillStyleId: '',
            listOptions: { type: 'NONE' },
            indentation: 0,
            hyperlink: null,
          },
        ],
        ...overrides,
      } as unknown as SceneNode
    }

    // Helper to build a variant COMPONENT with MypageIcon + Text + Arrow children
    function createVariantWithIcons(
      size: string,
      varient: string,
      opts: { hasIcons: boolean; px: number; gap: number },
    ) {
      const id = `${size}-${varient}`
      const children: SceneNode[] = []
      if (opts.hasIcons) {
        children.push(
          createInstanceChild(`icon-${id}`, 'MypageIcon', {
            componentPropertyReferences: {
              visible: 'leftIcon#70:100',
            },
          }),
        )
      }
      children.push(createTextChild(`text-${id}`, 'Label', `btn${size}`))
      if (opts.hasIcons) {
        children.push(
          createInstanceChild(`arrow-${id}`, 'Arrow', {
            componentPropertyReferences: {
              visible: 'rightIcon#71:101',
            },
          }),
        )
      }

      return createComponentNode(
        `size=${size}, varient=${varient}`,
        { size, varient },
        {
          id,
          children: children as unknown as readonly SceneNode[],
          layoutMode: 'HORIZONTAL',
          itemSpacing: opts.gap,
          paddingLeft: opts.px,
          paddingRight: opts.px,
          paddingTop: 10,
          paddingBottom: 10,
        },
      )
    }

    const sizes = ['lg', 'md', 'sm', 'tag']
    const varients = ['primary', 'white']
    const allChildren: ComponentNode[] = []

    for (const size of sizes) {
      for (const varient of varients) {
        const hasIcons = size !== 'tag'
        allChildren.push(
          createVariantWithIcons(size, varient, {
            hasIcons,
            px: size === 'tag' ? 10 : 24,
            gap: 10,
          }),
        )
      }
    }

    const componentSet = createComponentSetNode(
      'Button',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'lg',
          variantOptions: sizes,
        },
        varient: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: varients,
        },
        'leftIcon#70:100': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
        'rightIcon#71:101': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
      },
      allChildren,
    )

    // Set parent references
    for (const child of allChildren) {
      ;(child as unknown as { parent: ComponentSetNode }).parent = componentSet
      if ('children' in child && child.children) {
        for (const grandchild of child.children) {
          ;(grandchild as unknown as { parent: SceneNode }).parent = child
        }
      }
    }

    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'Button',
    )

    expect(codes.length).toBe(1)
    const [, generatedCode] = codes[0]

    // Should have leftIcon and rightIcon as boolean props
    expect(generatedCode).toContain('leftIcon?: boolean')
    expect(generatedCode).toContain('rightIcon?: boolean')

    // MypageIcon should have leftIcon condition
    // Arrow should have rightIcon condition
    expect(generatedCode).toMatch(/leftIcon\s*&&/)
    expect(generatedCode).toMatch(/rightIcon\s*&&/)

    // MypageIcon and Arrow only exist in lg, md, sm — not tag
    // So there should also be a size condition
    expect(generatedCode).toMatch(
      /size\s*===\s*"lg"\s*\|\|\s*size\s*===\s*"md"\s*\|\|\s*size\s*===\s*"sm"/,
    )
  })

  test('BOOLEAN conditions survive after codegen.run() populates globalBuildTreeCache', async () => {
    // Regression test: In real Figma, codegen.run(componentSet) is called first,
    // populating globalBuildTreeCache. Then generateVariantResponsiveComponents is called.
    // Without resetting the cache, buildTree returns cached trees without firing
    // addComponentTree, so BOOLEAN conditions are never set on children.

    function createInstanceChild3(
      id: string,
      name: string,
      overrides: Record<string, unknown> = {},
    ): SceneNode {
      return {
        type: 'INSTANCE',
        id,
        name,
        visible: true,
        children: [
          {
            type: 'VECTOR',
            id: `${id}-vec`,
            name: `${name}Vector`,
            visible: true,
            isAsset: true,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 1, g: 1, b: 1 },
                opacity: 1,
              },
            ],
            strokes: [],
            effects: [],
            reactions: [],
          },
        ],
        fills: [],
        strokes: [],
        effects: [],
        reactions: [],
        isAsset: true,
        width: 20,
        height: 20,
        ...overrides,
      } as unknown as SceneNode
    }

    function createTextChild3(
      id: string,
      name: string,
      text: string,
    ): SceneNode {
      return {
        type: 'TEXT',
        id,
        name,
        visible: true,
        characters: text,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 1, b: 1 },
            opacity: 1,
          },
        ],
        strokes: [],
        effects: [],
        reactions: [],
        width: 50,
        height: 20,
        fontSize: 16,
        fontName: { family: 'Pretendard', style: 'Bold' },
        fontWeight: 600,
        textAlignHorizontal: 'LEFT',
        textAlignVertical: 'CENTER',
        letterSpacing: { value: -2, unit: 'PERCENT' },
        lineHeight: { unit: 'AUTO' },
        textAutoResize: 'WIDTH_AND_HEIGHT',
        textStyleId: '',
        getStyledTextSegments: () => [
          {
            characters: text,
            start: 0,
            end: text.length,
            fontSize: 16,
            fontName: { family: 'Pretendard', style: 'Bold' },
            fontWeight: 600,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 1, g: 1, b: 1 },
                opacity: 1,
              },
            ],
            textDecoration: 'NONE',
            textCase: 'ORIGINAL',
            lineHeight: { unit: 'AUTO' },
            letterSpacing: { value: -2, unit: 'PERCENT' },
            textStyleId: '',
            fillStyleId: '',
            listOptions: { type: 'NONE' },
            indentation: 0,
            hyperlink: null,
          },
        ],
      } as unknown as SceneNode
    }

    const sizes = ['lg', 'tag']
    const varients = ['primary', 'white']
    const allChildren: ComponentNode[] = []

    for (const size of sizes) {
      for (const varient of varients) {
        const hasIcons = size !== 'tag'
        const id = `cache-${size}-${varient}`
        const children: SceneNode[] = []
        if (hasIcons) {
          children.push(
            createInstanceChild3(`icon-${id}`, 'MypageIcon', {
              componentPropertyReferences: {
                visible: 'leftIcon#70:100',
              },
            }),
          )
        }
        children.push(createTextChild3(`text-${id}`, 'Label', `btn${size}`))
        allChildren.push(
          createComponentNode(
            `size=${size}, varient=${varient}`,
            { size, varient },
            {
              id,
              children: children as unknown as readonly SceneNode[],
              layoutMode: 'HORIZONTAL',
              itemSpacing: 10,
              paddingLeft: size === 'tag' ? 10 : 24,
              paddingRight: size === 'tag' ? 10 : 24,
              paddingTop: 10,
              paddingBottom: 10,
            },
          ),
        )
      }
    }

    const componentSet = createComponentSetNode(
      'CacheButton',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'lg',
          variantOptions: sizes,
        },
        varient: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: varients,
        },
        'leftIcon#70:100': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
      },
      allChildren,
    )

    // Set parent references
    for (const child of allChildren) {
      ;(child as unknown as { parent: ComponentSetNode }).parent = componentSet
      if ('children' in child && child.children) {
        for (const grandchild of child.children) {
          ;(grandchild as unknown as { parent: SceneNode }).parent = child
        }
      }
    }

    // Step 1: Run codegen.run() first — this populates globalBuildTreeCache
    // (simulates what happens in code-impl.ts before generateVariantResponsiveComponents)
    const codegen = new Codegen(componentSet as unknown as SceneNode)
    await codegen.run()

    // Step 2: Reset cache (this is the fix in code-impl.ts)
    resetGlobalBuildTreeCache()

    // Step 3: Now generate responsive components
    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'CacheButton',
    )

    expect(codes.length).toBe(1)
    const [, generatedCode] = codes[0]

    // Should have leftIcon as a boolean prop
    expect(generatedCode).toContain('leftIcon?: boolean')

    // MypageIcon should have leftIcon condition — THIS WOULD FAIL without the cache reset
    expect(generatedCode).toMatch(/leftIcon\s*&&/)
  })

  test('generates BOOLEAN conditions with effect variants (real Button scenario)', async () => {
    // Mirrors the REAL Figma Button with effect variants:
    //   - size: lg, md, sm, tag (VARIANT)
    //   - varient: primary, white, ghost (VARIANT)
    //   - effect: default, hover (VARIANT) — becomes pseudo-selectors
    //   - leftIcon: boolean (BOOLEAN) — controls MypageIcon visibility
    //
    // The effect variant is filtered to only keep 'default' children.
    // This ensures the BOOLEAN condition still propagates through the
    // effect-filtering + multi-variant merge pipeline.

    function createInstanceChild2(
      id: string,
      name: string,
      overrides: Record<string, unknown> = {},
    ): SceneNode {
      return {
        type: 'INSTANCE',
        id,
        name,
        visible: true,
        children: [
          {
            type: 'VECTOR',
            id: `${id}-vec`,
            name: `${name}Vector`,
            visible: true,
            isAsset: true,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 1, g: 1, b: 1 },
                opacity: 1,
              },
            ],
            strokes: [],
            effects: [],
            reactions: [],
          },
        ],
        fills: [],
        strokes: [],
        effects: [],
        reactions: [],
        isAsset: true,
        width: 20,
        height: 20,
        ...overrides,
      } as unknown as SceneNode
    }

    function createTextChild2(
      id: string,
      name: string,
      text: string,
    ): SceneNode {
      return {
        type: 'TEXT',
        id,
        name,
        visible: true,
        characters: text,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 1, b: 1 },
            opacity: 1,
          },
        ],
        strokes: [],
        effects: [],
        reactions: [],
        width: 50,
        height: 20,
        fontSize: 16,
        fontName: { family: 'Pretendard', style: 'Bold' },
        fontWeight: 600,
        textAlignHorizontal: 'LEFT',
        textAlignVertical: 'CENTER',
        letterSpacing: { value: -2, unit: 'PERCENT' },
        lineHeight: { unit: 'AUTO' },
        textAutoResize: 'WIDTH_AND_HEIGHT',
        textStyleId: '',
        getStyledTextSegments: () => [
          {
            characters: text,
            start: 0,
            end: text.length,
            fontSize: 16,
            fontName: { family: 'Pretendard', style: 'Bold' },
            fontWeight: 600,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 1, g: 1, b: 1 },
                opacity: 1,
              },
            ],
            textDecoration: 'NONE',
            textCase: 'ORIGINAL',
            lineHeight: { unit: 'AUTO' },
            letterSpacing: { value: -2, unit: 'PERCENT' },
            textStyleId: '',
            fillStyleId: '',
            listOptions: { type: 'NONE' },
            indentation: 0,
            hyperlink: null,
          },
        ],
      } as unknown as SceneNode
    }

    const sizes = ['lg', 'md', 'sm', 'tag']
    const varients = ['primary', 'white', 'ghost']
    const effects = ['default', 'hover']
    const allChildren: ComponentNode[] = []

    for (const size of sizes) {
      for (const varient of varients) {
        for (const effect of effects) {
          const hasIcons = size !== 'tag'
          const id = `${size}-${varient}-${effect}`
          const children: SceneNode[] = []
          if (hasIcons) {
            children.push(
              createInstanceChild2(`icon-${id}`, 'MypageIcon', {
                componentPropertyReferences: {
                  visible: 'leftIcon#70:100',
                },
              }),
            )
          }
          children.push(createTextChild2(`text-${id}`, 'Label', `btn${size}`))
          if (hasIcons) {
            children.push(
              createInstanceChild2(`arrow-${id}`, 'Arrow', {
                componentPropertyReferences: {
                  visible: 'rightIcon#71:101',
                },
              }),
            )
          }
          const bgColor =
            effect === 'hover'
              ? { r: 0.3, g: 0.5, b: 0.9 }
              : { r: 0.2, g: 0.4, b: 0.8 }
          allChildren.push(
            createComponentNode(
              `size=${size}, varient=${varient}, effect=${effect}`,
              { size, varient, effect },
              {
                id,
                children: children as unknown as readonly SceneNode[],
                layoutMode: 'HORIZONTAL',
                itemSpacing: 10,
                paddingLeft: size === 'tag' ? 10 : 24,
                paddingRight: size === 'tag' ? 10 : 24,
                paddingTop: 10,
                paddingBottom: 10,
                fills: [
                  {
                    type: 'SOLID',
                    visible: true,
                    color: bgColor,
                    opacity: 1,
                  } as unknown as Paint,
                ],
              },
            ),
          )
        }
      }
    }

    const componentSet = createComponentSetNode(
      'Button',
      {
        size: {
          type: 'VARIANT',
          defaultValue: 'lg',
          variantOptions: sizes,
        },
        varient: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: varients,
        },
        effect: {
          type: 'VARIANT',
          defaultValue: 'default',
          variantOptions: effects,
        },
        'leftIcon#70:100': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
        'rightIcon#71:101': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
      },
      allChildren,
    )

    // Set parent references
    for (const child of allChildren) {
      ;(child as unknown as { parent: ComponentSetNode }).parent = componentSet
      if ('children' in child && child.children) {
        for (const grandchild of child.children) {
          ;(grandchild as unknown as { parent: SceneNode }).parent = child
        }
      }
    }

    const codes = await ResponsiveCodegen.generateVariantResponsiveComponents(
      componentSet,
      'Button',
    )

    expect(codes.length).toBe(1)
    const [, generatedCode] = codes[0]

    // Should have leftIcon and rightIcon as boolean props
    expect(generatedCode).toContain('leftIcon?: boolean')
    expect(generatedCode).toContain('rightIcon?: boolean')

    // MypageIcon should have leftIcon condition
    expect(generatedCode).toMatch(/leftIcon\s*&&/)
    // Arrow should have rightIcon condition
    expect(generatedCode).toMatch(/rightIcon\s*&&/)
  })
})
