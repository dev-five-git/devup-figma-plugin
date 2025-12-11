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
})
