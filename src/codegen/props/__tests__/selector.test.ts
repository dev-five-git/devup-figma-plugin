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
