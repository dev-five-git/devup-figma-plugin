import { describe, expect, test } from 'bun:test'
import { extractInstanceVariantProps } from '../extract-instance-variant-props'

describe('extractInstanceVariantProps', () => {
  test('extracts VARIANT type props with sanitized keys', () => {
    // Figma componentProperties keys include node IDs like "property#nodeId:uniqueId"
    const node = {
      componentProperties: {
        'status#123:456': { type: 'VARIANT', value: 'scroll' },
        'size#789:012': { type: 'VARIANT', value: 'Md' },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    // sanitizePropertyName keeps alphanumeric characters
    expect(result).toEqual({
      status123456: 'scroll',
      size789012: 'Md',
    })
  })

  test('ignores non-VARIANT type props', () => {
    const node = {
      componentProperties: {
        'status#123:456': { type: 'VARIANT', value: 'active' },
        'label#789:012': { type: 'TEXT', value: 'Click me' },
        'visible#345:678': { type: 'BOOLEAN', value: true },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({
      status123456: 'active',
    })
  })

  test('returns empty object when componentProperties is undefined', () => {
    const node = {
      componentProperties: undefined,
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({})
  })

  test('returns empty object when componentProperties is null', () => {
    const node = {
      componentProperties: null,
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({})
  })

  test('handles Korean property names (속성 -> property)', () => {
    const node = {
      componentProperties: {
        '속성 1#789:012': { type: 'VARIANT', value: '값1' },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    // sanitizePropertyName converts "속성 1" to "property1"
    expect(result.property1789012).toBe('값1')
  })

  test('converts values to string', () => {
    const node = {
      componentProperties: {
        count: { type: 'VARIANT', value: 5 },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result.count).toBe('5')
    expect(typeof result.count).toBe('string')
  })

  test('handles simple property names without node IDs', () => {
    const node = {
      componentProperties: {
        status: { type: 'VARIANT', value: 'active' },
        variant: { type: 'VARIANT', value: 'primary' },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({
      status: 'active',
      variant: 'primary',
    })
  })

  test('filters out reserved "effect" variant key', () => {
    const node = {
      componentProperties: {
        status: { type: 'VARIANT', value: 'active' },
        effect: { type: 'VARIANT', value: 'hover' },
        'Effect#123:456': { type: 'VARIANT', value: 'pressed' },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({
      status: 'active',
    })
    expect(result.effect).toBeUndefined()
    expect(result.Effect123456).toBeUndefined()
  })

  test('filters out reserved "viewport" variant key', () => {
    const node = {
      componentProperties: {
        status: { type: 'VARIANT', value: 'active' },
        viewport: { type: 'VARIANT', value: 'desktop' },
        'Viewport#123:456': { type: 'VARIANT', value: 'mobile' },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({
      status: 'active',
    })
    expect(result.viewport).toBeUndefined()
    expect(result.Viewport123456).toBeUndefined()
  })

  test('filters out both effect and viewport but keeps other variants', () => {
    const node = {
      componentProperties: {
        status: { type: 'VARIANT', value: 'scroll' },
        size: { type: 'VARIANT', value: 'Md' },
        effect: { type: 'VARIANT', value: 'default' },
        viewport: { type: 'VARIANT', value: 'desktop' },
      },
    } as unknown as InstanceNode

    const result = extractInstanceVariantProps(node)

    expect(result).toEqual({
      status: 'scroll',
      size: 'Md',
    })
  })
})
