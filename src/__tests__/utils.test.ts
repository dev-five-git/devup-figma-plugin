import { afterEach, describe, expect, it, test } from 'bun:test'
import {
  getComponentName,
  propsToPropsWithTypography,
  resetTextStyleCache,
  space,
} from '../utils'

// Minimal figma global for propsToPropsWithTypography tests
if (!(globalThis as { figma?: unknown }).figma) {
  ;(globalThis as { figma?: unknown }).figma = {
    getLocalTextStylesAsync: () => Promise.resolve([]),
    getStyleByIdAsync: () => Promise.resolve(null),
  } as unknown as typeof figma
}

describe('space', () => {
  it('should create space', () => {
    expect(space(0)).toEqual('')
    expect(space(1)).toEqual('  ')
    expect(space(2)).toEqual('    ')
  })
})

describe('propsToPropsWithTypography', () => {
  afterEach(() => {
    resetTextStyleCache()
  })

  it('should apply typography from resolved cache (sync fast path)', async () => {
    const origGetLocal = figma.getLocalTextStylesAsync
    const origGetStyle = figma.getStyleByIdAsync
    figma.getLocalTextStylesAsync = () =>
      Promise.resolve([{ id: 'ts-1' } as unknown as TextStyle]) as ReturnType<
        typeof figma.getLocalTextStylesAsync
      >
    figma.getStyleByIdAsync = (id: string) =>
      Promise.resolve(
        id === 'ts-1'
          ? ({ id: 'ts-1', name: 'Typography/Body' } as unknown as BaseStyle)
          : null,
      ) as ReturnType<typeof figma.getStyleByIdAsync>

    // First call: populates async caches + resolved caches via .then()
    const r1 = await propsToPropsWithTypography(
      { fontFamily: 'Arial', fontSize: 16, w: 100, h: 50 },
      'ts-1',
    )
    expect(r1.typography).toBe('body')
    expect(r1.fontFamily).toBeUndefined()
    expect(r1.w).toBeUndefined()

    // Second call: hits sync resolved-value cache (lines 71-72)
    const r2 = await propsToPropsWithTypography(
      { fontFamily: 'Inter', fontSize: 14, w: 200, h: 60 },
      'ts-1',
    )
    expect(r2.typography).toBe('body')
    expect(r2.fontFamily).toBeUndefined()
    expect(r2.w).toBeUndefined()

    figma.getLocalTextStylesAsync = origGetLocal
    figma.getStyleByIdAsync = origGetStyle
  })

  it('should return early from sync path when textStyleId not in resolved set', async () => {
    const origGetLocal = figma.getLocalTextStylesAsync
    const origGetStyle = figma.getStyleByIdAsync
    figma.getLocalTextStylesAsync = () =>
      Promise.resolve([{ id: 'ts-1' } as unknown as TextStyle]) as ReturnType<
        typeof figma.getLocalTextStylesAsync
      >
    figma.getStyleByIdAsync = () =>
      Promise.resolve(null) as ReturnType<typeof figma.getStyleByIdAsync>

    // First call: populates resolved cache
    await propsToPropsWithTypography(
      { fontFamily: 'Arial', w: 100, h: 50 },
      'ts-1',
    )

    // Second call with unknown textStyleId — hits else branch (lines 75-76)
    const r = await propsToPropsWithTypography(
      { fontFamily: 'Inter', w: 200, h: 60 },
      'ts-unknown',
    )
    expect(r.fontFamily).toBe('Inter')
    expect(r.typography).toBeUndefined()
    expect(r.w).toBeUndefined()

    // Third call with empty textStyleId — also hits else branch
    const r2 = await propsToPropsWithTypography(
      { fontFamily: 'Mono', w: 300, h: 70 },
      '',
    )
    expect(r2.fontFamily).toBe('Mono')
    expect(r2.typography).toBeUndefined()

    figma.getLocalTextStylesAsync = origGetLocal
    figma.getStyleByIdAsync = origGetStyle
  })

  it('should return props without typography when style resolves to null', async () => {
    const origGetLocal = figma.getLocalTextStylesAsync
    const origGetStyle = figma.getStyleByIdAsync
    figma.getLocalTextStylesAsync = () =>
      Promise.resolve([
        { id: 'ts-null' } as unknown as TextStyle,
      ]) as ReturnType<typeof figma.getLocalTextStylesAsync>
    figma.getStyleByIdAsync = () =>
      Promise.resolve(null) as ReturnType<typeof figma.getStyleByIdAsync>

    // First call: populates caches, style is null
    const r1 = await propsToPropsWithTypography(
      { fontFamily: 'Arial', fontSize: 16, w: 100, h: 50 },
      'ts-null',
    )
    expect(r1.typography).toBeUndefined()
    expect(r1.fontFamily).toBe('Arial')
    expect(r1.w).toBeUndefined()

    // Second call: sync path, styleByIdResolved has null → style is falsy, skip applyTypography
    const r2 = await propsToPropsWithTypography(
      { fontFamily: 'Inter', fontSize: 14, w: 200, h: 60 },
      'ts-null',
    )
    expect(r2.typography).toBeUndefined()
    expect(r2.fontFamily).toBe('Inter')
    expect(r2.w).toBeUndefined()

    figma.getLocalTextStylesAsync = origGetLocal
    figma.getStyleByIdAsync = origGetStyle
  })
})

describe('getComponentName', () => {
  test.each([
    {
      description: 'should return pascal case name for COMPONENT_SET',
      node: {
        type: 'COMPONENT_SET',
        name: 'button-component',
      } as unknown as SceneNode,
      expected: 'ButtonComponent',
    },
    {
      description:
        'should return parent name for COMPONENT with COMPONENT_SET parent',
      node: {
        type: 'COMPONENT',
        name: 'button-variant',
        parent: {
          type: 'COMPONENT_SET',
          name: 'button-set',
        } as unknown as SceneNode,
      } as unknown as SceneNode,
      expected: 'ButtonSet',
    },
    {
      description:
        'should return node name for COMPONENT without COMPONENT_SET parent',
      node: {
        type: 'COMPONENT',
        name: 'button-component',
        parent: null,
      } as unknown as SceneNode,
      expected: 'ButtonComponent',
    },
    {
      description: 'should return pascal case name for FRAME',
      node: {
        type: 'FRAME',
        name: 'my-frame',
      } as unknown as SceneNode,
      expected: 'MyFrame',
    },
    {
      description: 'should return pascal case name for RECTANGLE',
      node: {
        type: 'RECTANGLE',
        name: 'my-rectangle',
      } as unknown as SceneNode,
      expected: 'MyRectangle',
    },
    {
      description: 'should return pascal case name for TEXT',
      node: {
        type: 'TEXT',
        name: 'my-text',
      } as unknown as SceneNode,
      expected: 'MyText',
    },
  ])('$description', ({ node, expected }) => {
    expect(getComponentName(node)).toBe(expected)
  })
})
