import { describe, expect, mock, test } from 'bun:test'
import { paintToCSS } from '../paint-to-css'

// mock asset checker to avoid real node handling
mock.module('../check-asset-node', () => ({
  checkAssetNode: () => 'png',
}))

describe('paintToCSS', () => {
  test('converts image paint with TILE scaleMode to repeat url', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'IMAGE',
        visible: true,
        opacity: 1,
        scaleMode: 'TILE',
      } as unknown as ImagePaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toBe('url(/icons/image.png) repeat')
  })

  test('converts pattern paint with alignments and spacing', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      getNodeByIdAsync: mock(() =>
        Promise.resolve({ name: 'patternNode' } as unknown as SceneNode),
      ),
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'PATTERN',
        visible: true,
        opacity: 1,
        sourceNodeId: '1',
        spacing: { x: 1, y: 2 },
        horizontalAlignment: 'CENTER',
        verticalAlignment: 'END',
      } as unknown as PatternPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toBe(
      'url(/icons/patternNode.png) center 100% bottom 200% repeat',
    )
  })

  test('returns null for unsupported paint type', async () => {
    const res = await paintToCSS(
      { type: 'VIDEO' } as unknown as Paint,
      { width: 10, height: 10 } as unknown as SceneNode,
      false,
    )
    expect(res).toBeNull()
  })

  test('converts linear gradient with color token', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() =>
          Promise.resolve({ name: 'primary-color' }),
        ),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_LINEAR',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
          {
            position: 1,
            color: { r: 0, g: 0, b: 1, a: 1 },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('$primaryColor')
    expect(res).toContain('linear-gradient')
  })

  test('converts linear gradient with color token and opacity < 1', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() =>
          Promise.resolve({ name: 'primary-color' }),
        ),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_LINEAR',
        visible: true,
        opacity: 0.5,
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('color-mix')
    expect(res).toContain('$primaryColor')
    expect(res).toContain('transparent 50%')
  })

  test('converts radial gradient with color token and opacity', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() => Promise.resolve({ name: 'accent' })),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_RADIAL',
        visible: true,
        opacity: 0.8,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('radial-gradient')
    expect(res).toContain('color-mix')
    expect(res).toContain('$accent')
  })

  test('converts angular gradient with color token', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() => Promise.resolve({ name: 'bg-color' })),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_ANGULAR',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('conic-gradient')
    expect(res).toContain('$bgColor')
  })

  test('converts diamond gradient with color token and partial opacity', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() =>
          Promise.resolve({ name: 'surface-color' }),
        ),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_DIAMOND',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 0.6 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('linear-gradient')
    expect(res).toContain('color-mix')
    expect(res).toContain('$surfaceColor')
    expect(res).toContain('transparent 40%')
  })

  test('converts gradient with boundVariable but no variable name (fallback)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() => Promise.resolve(null)),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_LINEAR',
        visible: true,
        opacity: 0.5,
        gradientTransform: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('linear-gradient')
    expect(res).not.toContain('$')
    expect(res).not.toContain('color-mix')
  })

  test('converts radial gradient with boundVariable but no variable found', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() => Promise.resolve({})),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_RADIAL',
        visible: true,
        opacity: 0.8,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('radial-gradient')
    expect(res).not.toContain('$')
  })

  test('converts angular gradient with boundVariable but no variable found', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() => Promise.resolve({})),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_ANGULAR',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('conic-gradient')
    expect(res).not.toContain('$')
  })

  test('converts diamond gradient with boundVariable but no variable found', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() => Promise.resolve({})),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_DIAMOND',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('linear-gradient')
    expect(res).not.toContain('$')
  })

  test('converts diamond gradient with color token and full opacity (no color-mix)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() =>
          Promise.resolve({ name: 'primary-full' }),
        ),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_DIAMOND',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('linear-gradient')
    expect(res).toContain('$primaryFull')
    expect(res).not.toContain('color-mix')
  })

  test('converts angular gradient with color token and full opacity (no color-mix)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() =>
          Promise.resolve({ name: 'secondary-full' }),
        ),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_ANGULAR',
        visible: true,
        opacity: 1,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('conic-gradient')
    expect(res).toContain('$secondaryFull')
    expect(res).not.toContain('color-mix')
  })

  test('converts angular gradient with color token and partial opacity (with color-mix)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(() =>
          Promise.resolve({ name: 'accent-partial' }),
        ),
      },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_ANGULAR',
        visible: true,
        opacity: 0.6,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
            boundVariables: { color: { id: 'var-1' } },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('conic-gradient')
    expect(res).toContain('color-mix')
    expect(res).toContain('$accentPartial')
    expect(res).toContain('transparent 40%')
  })

  test('converts diamond gradient without color token (regular color)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_DIAMOND',
        visible: true,
        opacity: 0.8,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('linear-gradient')
    expect(res).not.toContain('$')
    expect(res).not.toContain('color-mix')
  })

  test('converts angular gradient without color token (regular color)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_ANGULAR',
        visible: true,
        opacity: 0.7,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('conic-gradient')
    expect(res).not.toContain('$')
    expect(res).not.toContain('color-mix')
  })

  test('converts radial gradient without color token (regular color)', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
    } as unknown as typeof figma

    const res = await paintToCSS(
      {
        type: 'GRADIENT_RADIAL',
        visible: true,
        opacity: 0.9,
        gradientTransform: [
          [1, 0, 0.5],
          [0, 1, 0.5],
        ],
        gradientStops: [
          {
            position: 0,
            color: { r: 1, g: 0, b: 0, a: 1 },
          },
        ],
      } as unknown as GradientPaint,
      { width: 100, height: 100 } as unknown as SceneNode,
      false,
    )

    expect(res).toContain('radial-gradient')
    expect(res).not.toContain('$')
    expect(res).not.toContain('color-mix')
  })
})
