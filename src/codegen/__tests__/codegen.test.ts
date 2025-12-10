import { beforeAll, describe, expect, test } from 'bun:test'
import { Codegen } from '../Codegen'

beforeAll(() => {
  ;(globalThis as { figma?: unknown }).figma = {
    mixed: Symbol('mixed'),
    util: {
      rgba: () => ({ r: 1, g: 0, b: 0, a: 1 }),
    },
    getLocalTextStylesAsync: () => [],
  } as unknown as typeof figma
  return () => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  }
})

function createTextSegment(characters: string): StyledTextSegment {
  return {
    characters,
    textStyleId: 'style1',
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
    start: 0,
    end: characters.length,
    fontSize: 16,
    fontName: { family: 'Arial', style: 'Regular' },
    fontWeight: 400,
    lineHeight: { unit: 'PIXELS', value: 1.5 },
    letterSpacing: { unit: 'PIXELS', value: 0 },
    textDecoration: 'NONE',
    textCase: 'ORIGINAL',
    listOptions: {
      type: 'NONE',
    },
  } as unknown as StyledTextSegment
}

describe('Codegen', () => {
  type TestCase = {
    title: string
    node: SceneNode
    expected: string
  }

  test.each<TestCase>([
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
    {
      title: 'renders text node with content',
      node: {
        type: 'TEXT',
        name: 'Text',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Hello'),
            characters: 'Hello',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
>
  Hello
</Text>`,
    },
  ])('$title', async ({ node, expected }) => {
    const codegen = new Codegen(node)
    await codegen.run()
    expect(codegen.getCode()).toBe(expected)
  })
})
