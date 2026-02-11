import { describe, expect, test } from 'bun:test'
import { getSelectorProps } from '../selector'

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

describe('getSelectorProps', () => {
  test('returns undefined for non-COMPONENT_SET node', async () => {
    const node = {
      type: 'FRAME',
      name: 'NotComponentSet',
      children: [],
      visible: true,
    } as unknown as FrameNode

    const result = await getSelectorProps(node as unknown as ComponentSetNode)
    expect(result).toBeUndefined()
  })

  test('handles componentPropertyDefinitions with effect property', async () => {
    const defaultVariant = {
      type: 'COMPONENT',
      name: 'State=Default, effect=default',
      children: [],
      visible: true,
      reactions: [],
      variantProperties: { State: 'Default', effect: 'default' },
    } as unknown as ComponentNode

    const hoverVariant = {
      type: 'COMPONENT',
      name: 'State=Hover, effect=hover',
      children: [],
      visible: true,
      reactions: [],
      variantProperties: { State: 'Hover', effect: 'hover' },
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 0, g: 0.5, b: 1 },
          opacity: 1,
        },
      ],
    } as unknown as ComponentNode

    const node = {
      type: 'COMPONENT_SET',
      name: 'EffectButton',
      children: [defaultVariant, hoverVariant],
      defaultVariant,
      visible: true,
      componentPropertyDefinitions: {
        State: {
          type: 'VARIANT',
          variantOptions: ['Default', 'Hover'],
        },
        effect: {
          type: 'VARIANT',
          variantOptions: ['default', 'hover'],
        },
      },
    } as unknown as ComponentSetNode

    const result = await getSelectorProps(node)
    expect(result).toBeDefined()
    // effect should not be in variants (it's treated specially)
    expect(result?.variants.effect).toBeUndefined()
    expect(result?.variants.State).toBe("'Default' | 'Hover'")
  })

  test('handles COMPONENT node with COMPONENT_SET parent', async () => {
    const defaultVariant = {
      type: 'COMPONENT',
      name: 'State=Default',
      children: [],
      visible: true,
      reactions: [],
    } as unknown as ComponentNode

    const componentSet = {
      type: 'COMPONENT_SET',
      name: 'TestSet',
      children: [defaultVariant],
      defaultVariant,
      visible: true,
      componentPropertyDefinitions: {
        State: {
          type: 'VARIANT',
          variantOptions: ['Default'],
        },
      },
    } as unknown as ComponentSetNode

    // Set parent relationship
    ;(defaultVariant as unknown as { parent: ComponentSetNode }).parent =
      componentSet

    const result = await getSelectorProps(defaultVariant)
    expect(result).toBeDefined()
    expect(result?.variants.State).toBe("'Default'")
  })

  test('includes BOOLEAN properties as boolean in variants', async () => {
    const defaultVariant = {
      type: 'COMPONENT',
      name: 'size=Default',
      children: [],
      visible: true,
      reactions: [],
      variantProperties: { size: 'Default' },
    } as unknown as ComponentNode

    const node = {
      type: 'COMPONENT_SET',
      name: 'ButtonWithToggle',
      children: [defaultVariant],
      defaultVariant,
      visible: true,
      componentPropertyDefinitions: {
        size: {
          type: 'VARIANT',
          variantOptions: ['Default', 'Small'],
        },
        'showIcon#70:123': {
          type: 'BOOLEAN',
          defaultValue: true,
        },
      },
    } as unknown as ComponentSetNode

    const result = await getSelectorProps(node)

    expect(result).toBeDefined()
    expect(result?.variants.size).toBe("'Default' | 'Small'")
    expect(result?.variants.showIcon).toBe('boolean')
  })

  test('includes TEXT properties as string in variants', async () => {
    const defaultVariant = {
      type: 'COMPONENT',
      name: 'size=Default',
      children: [],
      visible: true,
      reactions: [],
      variantProperties: { size: 'Default' },
    } as unknown as ComponentNode

    const node = {
      type: 'COMPONENT_SET',
      name: 'ButtonWithLabel',
      children: [defaultVariant],
      defaultVariant,
      visible: true,
      componentPropertyDefinitions: {
        size: {
          type: 'VARIANT',
          variantOptions: ['Default', 'Small'],
        },
        'label#80:456': {
          type: 'TEXT',
          defaultValue: 'Click me',
        },
      },
    } as unknown as ComponentSetNode

    const result = await getSelectorProps(node)

    expect(result).toBeDefined()
    expect(result?.variants.size).toBe("'Default' | 'Small'")
    expect(result?.variants.label).toBe('string')
  })

  test('includes INSTANCE_SWAP properties as React.ReactNode in variants', async () => {
    const defaultVariant = {
      type: 'COMPONENT',
      name: 'size=Default',
      children: [],
      visible: true,
      reactions: [],
      variantProperties: { size: 'Default' },
    } as unknown as ComponentNode

    const node = {
      type: 'COMPONENT_SET',
      name: 'ButtonWithIcon',
      children: [defaultVariant],
      defaultVariant,
      visible: true,
      componentPropertyDefinitions: {
        size: {
          type: 'VARIANT',
          variantOptions: ['Default', 'Small'],
        },
        'leftIcon#60:123': {
          type: 'INSTANCE_SWAP',
          defaultValue: 'comp_abc',
          preferredValues: [],
        },
        'rightIcon#61:456': {
          type: 'INSTANCE_SWAP',
          defaultValue: 'comp_def',
          preferredValues: [],
        },
      },
    } as unknown as ComponentSetNode

    const result = await getSelectorProps(node)

    expect(result).toBeDefined()
    expect(result?.variants.size).toBe("'Default' | 'Small'")
    expect(result?.variants.leftIcon).toBe('React.ReactNode')
    expect(result?.variants.rightIcon).toBe('React.ReactNode')
  })

  describe('sanitizePropertyName', () => {
    test('returns variant for numeric-only property name', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: '123=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { '123': 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'NumericPropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          '123': {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      expect(result).toBeDefined()
      expect(result?.variants).toBeDefined()
      // Numeric property name '123' is prefixed with _ to become '_123'
      expect(result?.variants._123).toBe("'Default' | 'Active'")
    })

    test('returns variant for empty property name after cleaning', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: '한글=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { 한글: 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'KoreanPropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          한글: {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      expect(result).toBeDefined()
      expect(result?.variants).toBeDefined()
      // Korean property name should be sanitized to 'variant' (empty after cleaning)
      expect(result?.variants.variant).toBe("'Default' | 'Active'")
    })

    test('converts Korean 속성 to property in property names', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: '속성1=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { 속성1: 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'KoreanPropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          속성1: {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      expect(result).toBeDefined()
      expect(result?.variants).toBeDefined()
      // Korean '속성1' should be converted to 'property1'
      expect(result?.variants.property1).toBe("'Default' | 'Active'")
    })

    test('converts 속성1 variant name to property1', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: '속성1=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { 속성1: 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'SpacedPropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          속성1: {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      expect(result).toBeDefined()
      expect(result?.variants).toBeDefined()
      // '속성1' should become 'property1'
      expect(result?.variants.property1).toBe("'Default' | 'Active'")
    })

    test('converts property name with spaces and special chars to camelCase', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'my-prop_name test=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { 'my-prop_name test': 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'CamelCasePropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          'my-prop_name test': {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      expect(result).toBeDefined()
      expect(result?.variants).toBeDefined()
      // Property name with special chars should be converted to camelCase
      expect(result?.variants.myPropNameTest).toBe("'Default' | 'Active'")
    })

    test('sanitizes property name that starts with digit', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: '1abc=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { '1abc': 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'DigitStartPropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          '1abc': {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      expect(result).toBeDefined()
      expect(result?.variants).toBeDefined()
      // Property name starting with digit should be prefixed with _
      expect(result?.variants._1abc).toBe("'Default' | 'Active'")
    })
  })

  describe('triggerTypeToEffect', () => {
    test('handles ON_HOVER trigger type', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'State=Default',
        children: [],
        visible: true,
        reactions: [{ trigger: { type: 'ON_HOVER' } }],
      } as unknown as ComponentNode

      const hoverVariant = {
        type: 'COMPONENT',
        name: 'State=Hover',
        children: [],
        visible: true,
        reactions: [{ trigger: { type: 'ON_HOVER' } }],
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0, g: 0.5, b: 1 },
            opacity: 1,
          },
        ],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'HoverButton',
        children: [defaultVariant, hoverVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          State: {
            type: 'VARIANT',
            variantOptions: ['Default', 'Hover'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)
      expect(result).toBeDefined()
      // Should have _hover props when triggerType is ON_HOVER
      expect(result?.props._hover).toBeDefined()
    })

    test('handles ON_PRESS trigger type', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'State=Default',
        children: [],
        visible: true,
        reactions: [{ trigger: { type: 'ON_PRESS' } }],
      } as unknown as ComponentNode

      const activeVariant = {
        type: 'COMPONENT',
        name: 'State=Active',
        children: [],
        visible: true,
        reactions: [{ trigger: { type: 'ON_PRESS' } }],
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
          },
        ],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'ActiveButton',
        children: [defaultVariant, activeVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          State: {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)
      expect(result).toBeDefined()
      // Should have _active props when triggerType is ON_PRESS
      expect(result?.props._active).toBeDefined()
    })

    test('handles effect-only COMPONENT_SET with solid button', async () => {
      // This tests a button component with only effect variant
      // effect options: active, default, disabled, hover
      // Using SOLID fills to avoid gradient transform complexity in tests
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'effect=default',
        children: [],
        visible: true,
        variantProperties: { effect: 'default' },
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.5, g: 0.3, b: 0.9 },
            opacity: 1,
          },
        ],
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            radius: 4,
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
            spread: -2,
          },
        ],
        opacity: 1,
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
        ],
      } as unknown as ComponentNode

      const hoverVariant = {
        type: 'COMPONENT',
        name: 'effect=hover',
        children: [],
        visible: true,
        variantProperties: { effect: 'hover' },
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.4, g: 0.2, b: 0.8 },
            opacity: 1,
          },
        ],
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            radius: 6,
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 4 },
            spread: -4,
          },
        ],
        opacity: 1,
        reactions: [],
      } as unknown as ComponentNode

      const activeVariant = {
        type: 'COMPONENT',
        name: 'effect=active',
        children: [],
        visible: true,
        variantProperties: { effect: 'active' },
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.4, g: 0.2, b: 0.8 },
            opacity: 1,
          },
        ],
        effects: [],
        opacity: 0.8,
        reactions: [],
      } as unknown as ComponentNode

      const disabledVariant = {
        type: 'COMPONENT',
        name: 'effect=disabled',
        children: [],
        visible: true,
        variantProperties: { effect: 'disabled' },
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0.898, g: 0.906, b: 0.922 },
            opacity: 1,
          },
        ],
        effects: [
          {
            type: 'DROP_SHADOW',
            visible: true,
            radius: 4,
            color: { r: 0, g: 0, b: 0, a: 0.1 },
            offset: { x: 0, y: 2 },
            spread: -2,
          },
        ],
        opacity: 1,
        reactions: [],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'SolidButton',
        children: [
          hoverVariant,
          activeVariant,
          defaultVariant,
          disabledVariant,
        ],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          effect: {
            type: 'VARIANT',
            defaultValue: 'default',
            variantOptions: ['active', 'default', 'disabled', 'hover'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)

      // Should return result even with effect-only component set
      expect(result).toBeDefined()
      // variants should be empty (effect is not included in variants)
      expect(Object.keys(result?.variants || {})).toHaveLength(0)
      // Should have _hover props
      expect(result?.props._hover).toBeDefined()
      // Should have _active props
      expect(result?.props._active).toBeDefined()
      // Should have _disabled props
      expect(result?.props._disabled).toBeDefined()
      // Should have transition props (from SMART_ANIMATE)
      expect(result?.props.transition).toBeDefined()
      expect(result?.props.transitionProperty).toBeDefined()
    })

    test('handles SMART_ANIMATE transition with reactions', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'State=Default',
        children: [],
        visible: true,
        reactions: [
          {
            trigger: { type: 'ON_HOVER' },
            actions: [
              {
                type: 'NODE',
                transition: {
                  type: 'SMART_ANIMATE',
                  duration: 0.3,
                  easing: { type: 'EASE_IN_AND_OUT' },
                },
              },
            ],
          },
        ],
      } as unknown as ComponentNode

      const hoverVariant = {
        type: 'COMPONENT',
        name: 'State=Hover',
        children: [],
        visible: true,
        reactions: [{ trigger: { type: 'ON_HOVER' } }],
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0, g: 0.5, b: 1 },
            opacity: 1,
          },
        ],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'AnimatedButton',
        children: [defaultVariant, hoverVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          State: {
            type: 'VARIANT',
            variantOptions: ['Default', 'Hover'],
          },
        },
      } as unknown as ComponentSetNode

      const result = await getSelectorProps(node)
      expect(result).toBeDefined()
      expect(result?.props._hover).toBeDefined()
      // Should have transition props when SMART_ANIMATE is used
      expect(result?.props.transition).toBeDefined()
      expect(result?.props.transitionProperty).toBeDefined()
    })
  })
})
