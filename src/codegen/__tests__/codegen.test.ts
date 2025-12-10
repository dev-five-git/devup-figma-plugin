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
      title: 'renders frame with padding',
      node: {
        type: 'FRAME',
        name: 'PaddedFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        paddingTop: 8,
        paddingRight: 16,
        paddingBottom: 8,
        paddingLeft: 16,
      } as unknown as FrameNode,
      expected: `<Box h="50px" px="16px" py="8px" w="100px" />`,
    },
    {
      title: 'renders padding shorthand when all sides equal',
      node: {
        type: 'FRAME',
        name: 'EqualPaddingFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 80,
        height: 40,
        paddingTop: 12,
        paddingRight: 12,
        paddingBottom: 12,
        paddingLeft: 12,
      } as unknown as FrameNode,
      expected: `<Box h="40px" p="12px" w="80px" />`,
    },
    {
      title: 'renders frame with border radius',
      node: {
        type: 'FRAME',
        name: 'RoundedFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 80,
        cornerRadius: 8,
      } as unknown as FrameNode,
      expected: `<Box borderRadius="8px" h="80px" w="120px" />`,
    },
    {
      title: 'renders mixed border radius frame',
      node: {
        type: 'FRAME',
        name: 'MixedRadius',
        children: [],
        topLeftRadius: 8,
        topRightRadius: 4,
        bottomRightRadius: 2,
        bottomLeftRadius: 1,
      } as unknown as FrameNode,
      expected: `<Box borderRadius="8px 4px 2px 1px" boxSize="100%" />`,
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
      title: 'renders boxSize when width equals height',
      node: {
        type: 'FRAME',
        name: 'SquareFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 64,
        height: 64,
      } as unknown as FrameNode,
      expected: `<Box boxSize="64px" />`,
    },
    {
      title: 'renders min/max width/height with px',
      node: {
        type: 'FRAME',
        name: 'MinMaxFrame',
        children: [],
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FILL',
        minWidth: 50,
        minHeight: 20,
        maxWidth: 200,
        maxHeight: 120,
      } as unknown as FrameNode,
      expected: `<Box
  boxSize="100%"
  maxH="120px"
  maxW="200px"
  minH="20px"
  minW="50px"
/>`,
    },
    {
      title: 'renders flex auto layout props',
      node: {
        type: 'FRAME',
        name: 'FlexAutoLayout',
        children: [],
        inferredAutoLayout: {
          layoutMode: 'HORIZONTAL',
          itemSpacing: 10,
        },
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'CENTER',
      } as unknown as FrameNode,
      expected: `<Flex alignItems="center" boxSize="100%" justifyContent="space-between" />`,
    },
    {
      title: 'renders grid auto layout props',
      node: {
        type: 'FRAME',
        name: 'GridAutoLayout',
        children: [],
        inferredAutoLayout: {
          layoutMode: 'GRID',
        },
        gridColumnCount: 3,
        gridRowCount: 2,
        gridColumnGap: 8,
        gridRowGap: 12,
      } as unknown as FrameNode,
      expected: `<Grid
  boxSize="100%"
  columnGap="8px"
  gridTemplateColumns="repeat(3, 1fr)"
  gridTemplateRows="repeat(2, 1fr)"
  rowGap="12px"
/>`,
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
    {
      title: 'renders another text node with content',
      node: {
        type: 'TEXT',
        name: 'Text2',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('World'),
            characters: 'World',
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
  World
</Text>`,
    },
    {
      title: 'renders text node with ellipsis props',
      node: {
        type: 'TEXT',
        name: 'EllipsisText',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Ellipsis'),
            characters: 'Ellipsis',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'ENDING',
      } as unknown as TextNode,
      expected: `<Text
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  overflow="hidden"
  textOverflow="ellipsis"
>
  Ellipsis
</Text>`,
    },
  ])('$title', async ({ node, expected }) => {
    const codegen = new Codegen(node)
    await codegen.run()
    expect(codegen.getCode()).toBe(expected)
  })
})
