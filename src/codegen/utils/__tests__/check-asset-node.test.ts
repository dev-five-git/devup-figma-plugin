import { beforeEach, describe, expect, test } from 'bun:test'
import { analyzeAssetNode, resetCheckAssetNodeCache } from '../check-asset-node'
import { resetVariableCache } from '../variable-cache'

describe('analyzeAssetNode', () => {
  beforeEach(() => {
    resetCheckAssetNodeCache()
    resetVariableCache()
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
    } as unknown as typeof figma
  })

  test('returns svg + sameColor for a component with one solid vector child', async () => {
    const child = {
      type: 'VECTOR',
      id: 'glyph',
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
    } as unknown as SceneNode

    const node = {
      type: 'COMPONENT',
      id: 'status-error',
      visible: true,
      children: [child],
      fills: [],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'svg',
      sameColor: '#FFF',
    })
  })

  test('returns null for excluded root types', async () => {
    const textNode = {
      type: 'TEXT',
      id: 'text-node',
    } as unknown as SceneNode

    const componentSetNode = {
      type: 'COMPONENT_SET',
      id: 'component-set-node',
    } as unknown as SceneNode

    const gridNode = {
      type: 'FRAME',
      id: 'grid-node',
      inferredAutoLayout: { layoutMode: 'GRID' },
    } as unknown as SceneNode

    await expect(analyzeAssetNode(textNode)).resolves.toEqual({
      assetType: null,
      sameColor: null,
    })
    await expect(analyzeAssetNode(componentSetNode)).resolves.toEqual({
      assetType: null,
      sameColor: null,
    })
    await expect(analyzeAssetNode(gridNode)).resolves.toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null for animation targets', async () => {
    const node = {
      type: 'FRAME',
      id: 'animated-node',
      reactions: [
        {
          actions: [
            {
              type: 'NODE',
              transition: { type: 'SMART_ANIMATE' },
            },
          ],
        },
      ],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns svg for ellipse with inner radius', async () => {
    const node = {
      type: 'ELLIPSE',
      id: 'ellipse-svg',
      arcData: { innerRadius: 0.5 },
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
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'svg',
      sameColor: '#FFF',
    })
  })

  test('returns svg for star nodes', async () => {
    const node = {
      type: 'STAR',
      id: 'star-node',
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
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'svg',
      sameColor: '#FFF',
    })
  })

  test('keeps sameColor null when wrapper has non-solid own fill', async () => {
    const child = {
      type: 'VECTOR',
      id: 'glyph-2',
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
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'instagram-like',
      visible: true,
      children: [child, child],
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
        },
      ],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'svg',
      sameColor: null,
    })
  })

  test('returns svg for nested asset leaf with all solid fills', async () => {
    const node = {
      type: 'FRAME',
      id: 'nested-solid-leaf',
      isAsset: true,
      visible: true,
      children: [],
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
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node, true)).toEqual({
      assetType: 'svg',
      sameColor: '#FFF',
    })
  })

  test('returns null for asset leaf with no fills metadata', async () => {
    const node = {
      type: 'FRAME',
      id: 'asset-no-fills',
      isAsset: true,
      visible: true,
      children: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null for non-nested asset leaf with only solid fills', async () => {
    const node = {
      type: 'FRAME',
      id: 'asset-solid-root',
      isAsset: true,
      visible: true,
      children: [],
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
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null for tile/pattern asset leaf', async () => {
    const node = {
      type: 'FRAME',
      id: 'asset-pattern-leaf',
      isAsset: true,
      visible: true,
      children: [],
      fills: [
        {
          type: 'PATTERN',
          visible: true,
        },
      ],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null for asset leaf with multiple image fills', async () => {
    const node = {
      type: 'FRAME',
      id: 'asset-multi-image',
      isAsset: true,
      visible: true,
      children: [],
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          scaleMode: 'FILL',
        },
        {
          type: 'IMAGE',
          visible: true,
          scaleMode: 'FIT',
        },
      ],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns png for asset leaf with a single image fill', async () => {
    const node = {
      type: 'FRAME',
      id: 'asset-single-image',
      isAsset: true,
      visible: true,
      children: [],
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          scaleMode: 'FILL',
        },
      ],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'png',
      sameColor: null,
    })
  })

  test('returns svg for nested non-asset leaf with solid fills only', async () => {
    const node = {
      type: 'FRAME',
      id: 'nested-non-asset-leaf',
      isAsset: false,
      visible: true,
      children: [],
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node, true)).toEqual({
      assetType: 'svg',
      sameColor: '#F00',
    })
  })

  test('returns null for non-nested non-asset leaf', async () => {
    const node = {
      type: 'FRAME',
      id: 'root-non-asset-leaf',
      isAsset: false,
      visible: true,
      children: [],
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns false sameColor for multi-child svg asset with conflicting own solid colors', async () => {
    const child = {
      type: 'VECTOR',
      id: 'child-svg',
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
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'multi-child-own-false',
      visible: true,
      children: [child, child],
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 0, g: 0, b: 1 },
          opacity: 1,
        },
      ],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'svg',
      sameColor: false,
    })
  })

  test('returns null when single-child wrapper has padding', async () => {
    const child = {
      type: 'VECTOR',
      id: 'single-child',
      visible: true,
      isAsset: true,
      fills: [],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'padded-wrapper',
      visible: true,
      children: [child],
      paddingLeft: 4,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      fills: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null when a multi-child wrapper has a non-svg child', async () => {
    const svgChild = {
      type: 'VECTOR',
      id: 'svg-child-ok',
      visible: true,
      isAsset: true,
      fills: [],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    const nonSvgChild = {
      type: 'FRAME',
      id: 'non-svg-child',
      visible: true,
      children: [],
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          scaleMode: 'FILL',
        },
      ],
      isAsset: true,
      reactions: [],
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'mixed-children-wrapper',
      visible: true,
      children: [svgChild, nonSvgChild],
      fills: [],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null when non-solid own color wrapper also has a non-svg child', async () => {
    const svgChild = {
      type: 'VECTOR',
      id: 'svg-child-own-null',
      visible: true,
      isAsset: true,
      fills: [],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    const nonSvgChild = {
      type: 'FRAME',
      id: 'non-svg-child-own-null',
      visible: true,
      children: [],
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          scaleMode: 'FILL',
        },
      ],
      isAsset: true,
      reactions: [],
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'own-null-non-svg-wrapper',
      visible: true,
      children: [svgChild, nonSvgChild],
      fills: [
        {
          type: 'GRADIENT_LINEAR',
          visible: true,
        },
      ],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('returns null when conflicting own solid colors wrapper also has a non-svg child', async () => {
    const svgChild = {
      type: 'VECTOR',
      id: 'svg-child-own-false',
      visible: true,
      isAsset: true,
      fills: [],
      strokes: [],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    const nonSvgChild = {
      type: 'FRAME',
      id: 'non-svg-child-own-false',
      visible: true,
      children: [],
      fills: [
        {
          type: 'IMAGE',
          visible: true,
          scaleMode: 'FILL',
        },
      ],
      isAsset: true,
      reactions: [],
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'own-false-non-svg-wrapper',
      visible: true,
      children: [svgChild, nonSvgChild],
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 0, g: 0, b: 1 },
          opacity: 1,
        },
      ],
      effects: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: null,
      sameColor: null,
    })
  })

  test('single-child wrapper delegates to child analysis when clean', async () => {
    const child = {
      type: 'VECTOR',
      id: 'delegated-child',
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
    } as unknown as SceneNode

    const node = {
      type: 'FRAME',
      id: 'delegating-wrapper',
      visible: true,
      children: [child],
      fills: [],
      reactions: [],
    } as unknown as SceneNode

    expect(await analyzeAssetNode(node)).toEqual({
      assetType: 'svg',
      sameColor: '#FFF',
    })
  })
})
