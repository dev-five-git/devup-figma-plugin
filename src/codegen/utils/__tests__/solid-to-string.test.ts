import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { solidToString, solidToStringSync } from '../solid-to-string'
import { resetVariableCache } from '../variable-cache'

describe('solidToString caching', () => {
  beforeEach(() => {
    resetVariableCache()
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: mock(async (id: string) => {
          if (id === 'color-var') {
            return { id, name: 'brand/primary' }
          }
          if (id === 'missing-var') {
            return null
          }
          return null
        }),
      },
    } as unknown as typeof figma
  })

  test('reuses cached sync solid color result', () => {
    const paintData = {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      opacity: 1,
    }

    expect(solidToStringSync(paintData as unknown as SolidPaint)).toBe('#F00')

    paintData.color = { r: 0, g: 1, b: 0 }

    expect(solidToStringSync(paintData as unknown as SolidPaint)).toBe('#F00')
  })

  test('reuses cached async variable-bound solid color result', async () => {
    const paintData: {
      type: 'SOLID'
      color: { r: number; g: number; b: number }
      opacity: number
      boundVariables?: { color?: { id: string } }
    } = {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      opacity: 1,
      boundVariables: {
        color: { id: 'color-var' },
      },
    }

    expect(await solidToString(paintData as unknown as SolidPaint)).toBe(
      '$brandPrimary',
    )

    paintData.boundVariables = undefined
    paintData.color = { r: 0, g: 1, b: 0 }

    expect(await solidToString(paintData as unknown as SolidPaint)).toBe(
      '$brandPrimary',
    )
  })

  test('async path reuses color cached by sync path', async () => {
    const paintData = {
      type: 'SOLID',
      color: { r: 0, g: 0, b: 1 },
      opacity: 1,
    }

    expect(solidToStringSync(paintData as unknown as SolidPaint)).toBe('#00F')
    expect(await solidToString(paintData as unknown as SolidPaint)).toBe('#00F')
  })

  test('returns transparent for zero-opacity solid paint', async () => {
    const paintData = {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      opacity: 0,
    }

    expect(solidToStringSync(paintData as unknown as SolidPaint)).toBe(
      'transparent',
    )
    expect(await solidToString(paintData as unknown as SolidPaint)).toBe(
      'transparent',
    )
  })

  test('falls back to raw color when bound variable lookup misses', async () => {
    const paintData = {
      type: 'SOLID',
      color: { r: 1, g: 0, b: 0 },
      opacity: 1,
      boundVariables: {
        color: { id: 'missing-var' },
      },
    }

    expect(await solidToString(paintData as unknown as SolidPaint)).toBe('#F00')
  })
})
