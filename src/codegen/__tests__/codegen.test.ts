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

function addParent(parent: SceneNode) {
  if ('children' in parent) {
    for (const child of parent.children) {
      ;(child as unknown as { parent: SceneNode }).parent = parent
      addParent(child)
    }
  }
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
      title: 'renders overflow hidden when clipsContent is true',
      node: {
        type: 'FRAME',
        name: 'ClippedFrame',
        children: [],
        clipsContent: true,
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" overflow="hidden" />`,
    },
    {
      title: 'renders objectFit contain for image asset',
      node: {
        type: 'RECTANGLE',
        name: 'ObjectFitContain',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 80,
        fills: [
          {
            type: 'IMAGE',
            visible: true,
            scaleMode: 'FIT',
          },
        ],
      } as unknown as RectangleNode,
      expected: `<Image h="80px" objectFit="contain" src="/icons/ObjectFitContain.png" w="100px" />`,
    },
    {
      title: 'renders objectFit cover for image asset',
      node: {
        type: 'RECTANGLE',
        name: 'ObjectFitCover',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 90,
        fills: [
          {
            type: 'IMAGE',
            visible: true,
            scaleMode: 'CROP',
          },
        ],
      } as unknown as RectangleNode,
      expected: `<Image h="90px" objectFit="cover" src="/icons/ObjectFitCover.png" w="120px" />`,
    },
    {
      title: 'omits objectFit when image scale mode is FILL',
      node: {
        type: 'RECTANGLE',
        name: 'ObjectFitFill',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 110,
        height: 70,
        fills: [
          {
            type: 'IMAGE',
            visible: true,
            scaleMode: 'FILL',
          },
        ],
      } as unknown as RectangleNode,
      expected: `<Image h="70px" src="/icons/ObjectFitFill.png" w="110px" />`,
    },
    {
      title: 'renders layout for absolute child same size as parent',
      node: {
        type: 'FRAME',
        name: 'Parent',
        width: 300,
        height: 200,
        layoutPositioning: 'AUTO',
        children: [
          {
            type: 'RECTANGLE',
            name: 'AbsoluteChild',
            layoutPositioning: 'ABSOLUTE',
            width: 300,
            height: 200,
            constraints: {
              horizontal: 'MAX',
              vertical: 'MAX',
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" pos="relative">
  <Box boxSize="100%" left="0px" pos="absolute" top="0px" />
</Box>`,
    },
    {
      title: 'renders absolute child with horizontal MAX constraint',
      node: {
        type: 'FRAME',
        name: 'ParentWithAutoLayout',
        width: 400,
        height: 300,
        inferredAutoLayout: {
          layoutMode: 'HORIZONTAL',
        },
        children: [
          {
            type: 'RECTANGLE',
            name: 'MaxRightChild',
            layoutPositioning: 'ABSOLUTE',
            x: 350,
            y: 50,
            width: 50,
            height: 100,
            constraints: {
              horizontal: 'MAX',
              vertical: 'MIN',
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<Flex boxSize="100%" pos="relative">
  <Box boxSize="100%" pos="absolute" right="0px" top="50px" />
</Flex>`,
    },
    {
      title: 'renders absolute child with horizontal CENTER constraint',
      node: {
        type: 'FRAME',
        name: 'ParentWithAutoLayout2',
        width: 500,
        height: 400,
        inferredAutoLayout: {
          layoutMode: 'VERTICAL',
        },
        children: [
          {
            type: 'RECTANGLE',
            name: 'CenterChild',
            layoutPositioning: 'ABSOLUTE',
            x: 200,
            y: 150,
            width: 100,
            height: 100,
            constraints: {
              horizontal: 'CENTER',
              vertical: 'CENTER',
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<VStack boxSize="100%" pos="relative">
  <Box
    bottom="0px"
    boxSize="100%"
    left="0px"
    pos="absolute"
    right="0px"
    top="0px"
  />
</VStack>`,
    },
    {
      title: 'renders absolute child with vertical MAX constraint',
      node: {
        type: 'FRAME',
        name: 'ParentWithAutoLayout3',
        width: 600,
        height: 500,
        inferredAutoLayout: {
          layoutMode: 'HORIZONTAL',
        },
        children: [
          {
            type: 'RECTANGLE',
            name: 'MaxBottomChild',
            layoutPositioning: 'ABSOLUTE',
            x: 50,
            y: 450,
            width: 100,
            height: 50,
            constraints: {
              horizontal: 'MIN',
              vertical: 'MAX',
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<Flex boxSize="100%" pos="relative">
  <Box bottom="0px" boxSize="100%" left="50px" pos="absolute" />
</Flex>`,
    },
    {
      title: 'renders absolute child with vertical CENTER constraint',
      node: {
        type: 'FRAME',
        name: 'ParentWithAutoLayout4',
        width: 700,
        height: 600,
        inferredAutoLayout: {
          layoutMode: 'VERTICAL',
        },
        children: [
          {
            type: 'RECTANGLE',
            name: 'VerticalCenterChild',
            layoutPositioning: 'ABSOLUTE',
            x: 300,
            y: 250,
            width: 100,
            height: 100,
            constraints: {
              horizontal: 'MIN',
              vertical: 'CENTER',
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<VStack boxSize="100%" pos="relative">
  <Box
    bottom="0px"
    boxSize="100%"
    left="300px"
    pos="absolute"
    top="0px"
  />
</VStack>`,
    },
    {
      title: 'renders flex=1 when parent is horizontal auto layout',
      node: {
        type: 'FRAME',
        name: 'HorizontalParent',
        layoutMode: 'HORIZONTAL',
        children: [
          {
            type: 'RECTANGLE',
            name: 'FlexChild',
            layoutSizingHorizontal: 'FILL',
            layoutSizingVertical: 'FIXED',
            height: 50,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%">
  <Box flex="1" h="50px" w="100%" />
</Box>`,
    },
    {
      title: 'renders aspect ratio when provided',
      node: {
        type: 'FRAME',
        name: 'AspectRatioFrame',
        children: [],
        targetAspectRatio: { x: 4, y: 3 },
        layoutSizingHorizontal: 'FILL',
        layoutSizingVertical: 'FILL',
      } as unknown as FrameNode,
      expected: `<Box aspectRatio="1.33" boxSize="100%" />`,
    },
    {
      title:
        'renders text with width_and_height auto resize returning no size props',
      node: {
        type: 'TEXT',
        name: 'TextWidthHeight',
        children: [],
        textAutoResize: 'WIDTH_AND_HEIGHT',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 40,
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('AutoSize'),
            characters: 'AutoSize',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
        characters: 'AutoSize',
      } as unknown as TextNode,
      expected: `<Text
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
>
  AutoSize
</Text>`,
    },
    {
      title: 'renders single-line max line props',
      node: {
        type: 'TEXT',
        name: 'MaxLineOne',
        children: [],
        textAutoResize: 'NONE',
        strokes: [],
        effects: [],
        maxLines: 1,
        getStyledTextSegments: () => [
          {
            ...createTextSegment('OneLine'),
            characters: 'OneLine',
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
  whiteSpace="nowrap"
>
  OneLine
</Text>`,
    },
    {
      title: 'renders multi-line max line props',
      node: {
        type: 'TEXT',
        name: 'MaxLineThree',
        children: [],
        textAutoResize: 'NONE',
        strokes: [],
        effects: [],
        maxLines: 3,
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Three lines of text'),
            characters: 'Three lines of text',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  WebkitBoxOrient="vertical"
  WebkitLineClamp="3"
  boxSize="100%"
  color="#F00"
  display="-webkit-box"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
>
  Three lines of text
</Text>`,
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
      title: 'renders padding with top equals bottom but left right different',
      node: {
        type: 'FRAME',
        name: 'TopBottomEqualPaddingFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 60,
        paddingTop: 10,
        paddingRight: 20,
        paddingBottom: 10,
        paddingLeft: 30,
      } as unknown as FrameNode,
      expected: `<Box
  h="60px"
  pl="30px"
  pr="20px"
  py="10px"
  w="100px"
/>`,
    },
    {
      title: 'renders padding with left equals right but top bottom different',
      node: {
        type: 'FRAME',
        name: 'LeftRightEqualPaddingFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 90,
        height: 50,
        paddingTop: 5,
        paddingRight: 15,
        paddingBottom: 25,
        paddingLeft: 15,
      } as unknown as FrameNode,
      expected: `<Box
  h="50px"
  pb="25px"
  pt="5px"
  px="15px"
  w="90px"
/>`,
    },
    {
      title: 'renders padding with all sides different',
      node: {
        type: 'FRAME',
        name: 'AllDifferentPaddingFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 110,
        height: 70,
        paddingTop: 1,
        paddingRight: 2,
        paddingBottom: 3,
        paddingLeft: 4,
      } as unknown as FrameNode,
      expected: `<Box
  h="70px"
  pb="3px"
  pl="4px"
  pr="2px"
  pt="1px"
  w="110px"
/>`,
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
      title: 'renders grid child positioning props when out of order',
      node: {
        type: 'FRAME',
        name: 'GridWithChildren',
        children: [
          {
            type: 'RECTANGLE',
            name: 'ChildB',
            visible: true,
            gridColumnAnchorIndex: 1,
            gridRowAnchorIndex: 0,
          } as unknown as SceneNode,
          {
            type: 'RECTANGLE',
            name: 'ChildA',
            visible: true,
            gridColumnAnchorIndex: 0,
            gridRowAnchorIndex: 0,
          } as unknown as SceneNode,
        ],
        inferredAutoLayout: {
          layoutMode: 'GRID',
        } as unknown as InferredAutoLayoutResult,
        gridColumnCount: 2,
        gridRowCount: 1,
        gridColumnGap: 0,
        gridRowGap: 0,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 200,
        height: 100,
      } as unknown as FrameNode,
      expected: `<Grid gridTemplateColumns="repeat(2, 1fr)" gridTemplateRows="repeat(1, 1fr)" h="100px" w="200px">
  <Box boxSize="100%" gridColumn="2 / span 1" gridRow="1 / span 1" />
  <Box boxSize="100%" gridColumn="1 / span 1" gridRow="1 / span 1" />
</Grid>`,
    },
    {
      title: 'renders vstack auto layout props',
      node: {
        type: 'FRAME',
        name: 'VStackAutoLayout',
        children: [
          { visible: true } as unknown as SceneNode,
          { visible: true } as unknown as SceneNode,
        ],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 200,
        inferredAutoLayout: {
          layoutMode: 'VERTICAL',
          itemSpacing: 16,
        },
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'CENTER',
      } as unknown as FrameNode,
      expected: `<VStack
  alignItems="center"
  gap="16px"
  h="200px"
  justifyContent="space-between"
  w="120px"
>
  <Box boxSize="100%" />
  <Box boxSize="100%" />
</VStack>`,
    },
    {
      title: 'renders center auto layout props',
      node: {
        type: 'FRAME',
        name: 'CenterAutoLayout',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 120,
        inferredAutoLayout: {
          layoutMode: 'HORIZONTAL',
          itemSpacing: 0,
        },
        primaryAxisAlignItems: 'CENTER',
        counterAxisAlignItems: 'CENTER',
      } as unknown as FrameNode,
      expected: `<Center boxSize="120px" />`,
    },
    {
      title: 'renders drop shadow effect props',
      node: {
        type: 'FRAME',
        name: 'EffectFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 60,
        effects: [
          {
            type: 'DROP_SHADOW',
            offset: { x: 2, y: 4 },
            radius: 6,
            spread: 1,
            color: { r: 1, g: 0, b: 0, a: 0.5 },
            visible: true,
            blendMode: 'NORMAL',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box boxShadow="2px 4px 6px 1px #FF000080" h="60px" w="100px" />`,
    },
    {
      title: 'renders inner shadow effect props',
      node: {
        type: 'FRAME',
        name: 'InnerShadowFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 90,
        height: 70,
        effects: [
          {
            type: 'INNER_SHADOW',
            offset: { x: -2, y: 3 },
            radius: 5,
            spread: 0,
            color: { r: 0, g: 1, b: 0, a: 1 },
            visible: true,
            blendMode: 'NORMAL',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box boxShadow="inset -2px 3px 5px 0 #0F0" h="70px" w="90px" />`,
    },
    {
      title: 'renders layer blur effect props',
      node: {
        type: 'FRAME',
        name: 'LayerBlurFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 80,
        effects: [
          {
            type: 'LAYER_BLUR',
            radius: 4,
            visible: true,
            blendMode: 'NORMAL',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box filter="blur(4px)" h="80px" w="120px" />`,
    },
    {
      title: 'renders background blur effect props',
      node: {
        type: 'FRAME',
        name: 'BackdropBlurFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 110,
        height: 90,
        effects: [
          {
            type: 'BACKGROUND_BLUR',
            radius: 8,
            visible: true,
            blendMode: 'NORMAL',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box WebkitBackdropFilter="blur(8px)" backdropFilter="blur(8px)" h="90px" w="110px" />`,
    },
    {
      title: 'renders noise effect props',
      node: {
        type: 'FRAME',
        name: 'NoiseEffectFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 140,
        height: 70,
        effects: [
          {
            type: 'NOISE',
            radius: 0,
            blendMode: 'NORMAL',
            visible: true,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box filter="contrast(100%) brightness(100%)" h="70px" w="140px" />`,
    },
    {
      title: 'renders texture effect props',
      node: {
        type: 'FRAME',
        name: 'TextureEffectFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 150,
        height: 60,
        effects: [
          {
            type: 'TEXTURE',
            radius: 0,
            blendMode: 'NORMAL',
            visible: true,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box filter="contrast(100%) brightness(100%)" h="60px" w="150px" />`,
    },
    {
      title: 'renders glass effect props',
      node: {
        type: 'FRAME',
        name: 'GlassEffectFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 160,
        height: 80,
        effects: [
          {
            type: 'GLASS',
            radius: 12,
            blendMode: 'NORMAL',
            visible: true,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box WebkitBackdropFilter="blur(12px)" backdropFilter="blur(12px)" h="80px" w="160px" />`,
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
    {
      title: 'renders text node with single drop shadow',
      node: {
        type: 'TEXT',
        name: 'TextWithShadow',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [
          {
            type: 'DROP_SHADOW',
            offset: { x: 2, y: 4 },
            radius: 6,
            color: { r: 0, g: 0, b: 0, a: 0.5 },
            visible: true,
            blendMode: 'NORMAL',
          },
        ],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Shadow'),
            characters: 'Shadow',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  boxShadow="2px 4px 6px 0 #00000080"
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  textShadow="2px 4px 6px #00000080"
>
  Shadow
</Text>`,
    },
    {
      title: 'renders text node with multiple drop shadows',
      node: {
        type: 'TEXT',
        name: 'TextWithMultipleShadows',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [
          {
            type: 'DROP_SHADOW',
            offset: { x: 1, y: 2 },
            radius: 3,
            color: { r: 1, g: 0, b: 0, a: 1 },
            visible: true,
            blendMode: 'NORMAL',
          },
          {
            type: 'DROP_SHADOW',
            offset: { x: 4, y: 5 },
            radius: 6,
            color: { r: 0, g: 1, b: 0, a: 0.8 },
            visible: true,
            blendMode: 'NORMAL',
          },
        ],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('MultiShadow'),
            characters: 'MultiShadow',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  boxShadow="1px 2px 3px 0 #F00, 4px 5px 6px 0 #0F0C"
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  textShadow="1px 2px 3px #F00, 4px 5px 6px #0F0C"
>
  MultiShadow
</Text>`,
    },
    {
      title: 'renders text node with stroke',
      node: {
        type: 'TEXT',
        name: 'TextWithStroke',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [
          {
            type: 'SOLID',
            color: { r: 0, g: 0, b: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: 2,
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Stroke'),
            characters: 'Stroke',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  WebkitTextStroke="2px #F00"
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  paintOrder="stroke fill"
>
  Stroke
</Text>`,
    },
    {
      title: 'renders frame with rotation transform',
      node: {
        type: 'FRAME',
        name: 'RotatedFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        rotation: 45,
      } as unknown as FrameNode,
      expected: `<Box h="50px" transform="rotate(45deg)" w="100px" />`,
    },
    {
      title: 'renders frame with negative rotation transform',
      node: {
        type: 'FRAME',
        name: 'NegativeRotatedFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 80,
        height: 40,
        rotation: -30,
      } as unknown as FrameNode,
      expected: `<Box h="40px" transform="rotate(-30deg)" w="80px" />`,
    },
    {
      title: 'renders frame with decimal rotation transform',
      node: {
        type: 'FRAME',
        name: 'DecimalRotatedFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 60,
        rotation: 15.5,
      } as unknown as FrameNode,
      expected: `<Box h="60px" transform="rotate(15.5deg)" w="120px" />`,
    },
  ])('$title', async ({ node, expected }) => {
    addParent(node)
    const codegen = new Codegen(node)
    await codegen.run()
    expect(codegen.getCode()).toBe(expected)
  })
})
