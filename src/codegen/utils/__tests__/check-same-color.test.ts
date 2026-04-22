import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { checkSameColor, resetCheckSameColorCache } from '../check-same-color'
import { resetVariableCache } from '../variable-cache'

describe('checkSameColor cache', () => {
  beforeEach(() => {
    resetCheckSameColorCache()
    resetVariableCache()
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(async (id: string) => {
          if (id === 'color-var') {
            return { id, name: 'brand/primary' }
          }
          return null
        }),
      },
    } as unknown as typeof figma
  })

  test('returns cached null when called again with a target color', async () => {
    const node = {
      id: 'node-null',
      type: 'RECTANGLE',
      fills: [{ visible: true, type: 'GRADIENT_LINEAR' }],
    } as unknown as SceneNode

    expect(await checkSameColor(node)).toBeNull()
    expect(await checkSameColor(node, '#ff0000')).toBeNull()
  })

  test('returns cached false when called again with a target color', async () => {
    const node = {
      id: 'node-false',
      type: 'FRAME',
      children: [
        {
          type: 'RECTANGLE',
          visible: true,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              color: { r: 1, g: 0, b: 0 },
              opacity: 1,
            },
          ],
        },
        {
          type: 'RECTANGLE',
          visible: true,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              color: { r: 0, g: 0, b: 1 },
              opacity: 1,
            },
          ],
        },
      ],
    } as unknown as SceneNode

    expect(await checkSameColor(node)).toBeFalse()
    expect(await checkSameColor(node, '#ff0000')).toBeFalse()
  })

  test('compares target color against cached uniform color', async () => {
    const node = {
      id: 'node-color',
      type: 'RECTANGLE',
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
        },
      ],
    } as unknown as SceneNode

    expect(await checkSameColor(node)).toBe('#F00')
    expect(await checkSameColor(node, '#F00')).toBe('#F00')
    expect(await checkSameColor(node, '#00FF00')).toBeFalse()
  })

  test('resolves variable-bound solid colors through async path', async () => {
    const node = {
      id: 'node-variable',
      type: 'RECTANGLE',
      fills: [
        {
          type: 'SOLID',
          visible: true,
          color: { r: 1, g: 0, b: 0 },
          opacity: 1,
          boundVariables: {
            color: { id: 'color-var' },
          },
        },
      ],
    } as unknown as SceneNode

    expect(await checkSameColor(node)).toBe('$brandPrimary')
  })
})
