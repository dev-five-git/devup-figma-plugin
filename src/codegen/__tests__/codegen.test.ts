import { describe, expect, test } from 'bun:test'
import { Codegen } from '../Codegen'

describe('Codegen', () => {
  test.each([
    {
      title: 'renders simple component without variants',
      node: {
        type: 'FRAME',
        name: 'Frame',
        children: [],
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" />`,
    },
    {
      title: 'renders fixed size frame',
      node: {
        type: 'FRAME',
        name: 'FixedFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 80,
      } as unknown as FrameNode,
      expected: `<Box h="80px" w="120px" />`,
    },
    {
      title: 'renders group as Box with full size',
      node: {
        type: 'GROUP',
        name: 'Group',
        children: [],
      } as unknown as GroupNode,
      expected: `<Box boxSize="100%" />`,
    },
  ])('$title', async ({ node, expected }) => {
    const codegen = new Codegen(node)
    await codegen.run()
    expect(codegen.getCode()).toBe(expected)
  })
})
