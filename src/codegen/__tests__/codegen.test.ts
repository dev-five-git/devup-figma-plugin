import { afterAll, describe, expect, test } from 'bun:test'
import { Codegen } from '../Codegen'

;(globalThis as { figma?: unknown }).figma = {
  mixed: Symbol('mixed'),
  util: {
    //  * ```ts
    //  * const rgba = figma.util.rgba
    //  * const color = rgba('rgb(25% 25% 25% / 0.5)')
    //  * ```
    //  *
    //  * @param color - A CSS color string, `RGB` object, or `RGBA` object.
    //  */
    // rgba(color: string | RGB | RGBA): RGBA
    rgba: (color: string | RGB | RGBA): RGBA => {
      if (typeof color === 'string') {
        // 간단한 CSS color string 파싱
        const rgbMatch = color.match(/rgb\(([^)]+)\)/)
        if (rgbMatch) {
          const values = rgbMatch[1].split(/[,\s/]+/).filter(Boolean)
          const r = values[0]?.includes('%')
            ? parseFloat(values[0]) / 100
            : parseFloat(values[0] || '0') / 255
          const g = values[1]?.includes('%')
            ? parseFloat(values[1]) / 100
            : parseFloat(values[1] || '0') / 255
          const b = values[2]?.includes('%')
            ? parseFloat(values[2]) / 100
            : parseFloat(values[2] || '0') / 255
          const a = values[3] ? parseFloat(values[3]) : 1
          return { r, g, b, a }
        }
        return { r: 0, g: 0, b: 0, a: 1 }
      }
      if (typeof color === 'object') {
        // RGB 객체인 경우 alpha 추가
        if ('a' in color) {
          return color
        }
        return { ...color, a: 1 }
      }
      return { r: 0, g: 0, b: 0, a: 1 }
    },
  },
  getLocalTextStylesAsync: () => [
    {
      id: 'text-style-1',
      name: 'Typography/Heading',
      type: 'TEXT',
    } as unknown as TextStyle,
  ],
  getStyleByIdAsync: async (id: string) => {
    if (id === 'text-style-1') {
      return {
        id: 'text-style-1',
        name: 'Typography/Heading',
        type: 'TEXT',
      } as unknown as TextStyle
    }
    return null
  },
  getNodeByIdAsync: async (id: string) => {
    if (id === 'pattern-node-id') {
      return {
        type: 'VECTOR',
        name: 'PatternIcon',
        children: [],
        isAsset: true,
      } as unknown as SceneNode
    }
    return null
  },
  variables: {
    getVariableByIdAsync: async (id: string) => {
      if (id === 'var1') {
        return {
          name: 'Primary Color',
          id: 'var1',
        } as unknown as Variable
      }
      return null
    },
  },
} as unknown as typeof figma
afterAll(() => {

  ;(globalThis as { figma?: unknown }).figma = undefined
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
      title: 'renders overflowX auto when overflowDirection is HORIZONTAL',
      node: {
        type: 'FRAME',
        name: 'HorizontalScroll',
        children: [],
        overflowDirection: 'HORIZONTAL',
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" overflowX="auto" />`,
    },
    {
      title: 'renders overflowY auto when overflowDirection is VERTICAL',
      node: {
        type: 'FRAME',
        name: 'VerticalScroll',
        children: [],
        overflowDirection: 'VERTICAL',
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" overflowY="auto" />`,
    },
    {
      title: 'renders overflow auto when overflowDirection is BOTH',
      node: {
        type: 'FRAME',
        name: 'BothScroll',
        children: [],
        overflowDirection: 'BOTH',
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" overflow="auto" />`,
    },
    {
      title: 'omits overflow when overflowDirection is NONE',
      node: {
        type: 'FRAME',
        name: 'NoScroll',
        children: [],
        overflowDirection: 'NONE',
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" />`,
    },
    {
      title:
        'omits overflow when clipsContent property exists but is explicitly false',
      node: {
        type: 'FRAME',
        name: 'NonClippedFrame',
        children: [],
        clipsContent: false,
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" />`,
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
      title: 'renders svg asset with vector node',
      node: {
        type: 'VECTOR',
        name: 'VectorIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
      } as unknown as VectorNode,
      expected: `<Image boxSize="24px" src="/icons/VectorIcon.svg" />`,
    },
    {
      title: 'renders svg asset with star node',
      node: {
        type: 'STAR',
        name: 'StarIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
      } as unknown as StarNode,
      expected: `<Image boxSize="24px" src="/icons/StarIcon.svg" />`,
    },
    {
      title: 'renders svg asset with polygon node',
      node: {
        type: 'POLYGON',
        name: 'PolygonIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
      } as unknown as PolygonNode,
      expected: `<Image boxSize="24px" src="/icons/PolygonIcon.svg" />`,
    },
    {
      title: 'renders svg asset with ellipse inner radius',
      node: {
        type: 'ELLIPSE',
        name: 'EllipseIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        arcData: {
          innerRadius: 0.5,
        },
      } as unknown as EllipseNode,
      expected: `<Image boxSize="24px" src="/icons/EllipseIcon.svg" />`,
    },
    {
      title: 'renders svg asset with non-solid fills',
      node: {
        type: 'RECTANGLE',
        name: 'GradientAsset',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as RectangleNode,
      expected: `<Image boxSize="24px" src="/icons/GradientAsset.svg" />`,
    },
    {
      title: 'renders asset with single child and fills',
      node: {
        type: 'FRAME',
        name: 'ParentAsset',
        children: [
          {
            type: 'VECTOR',
            name: 'ChildVector',
            children: [],
            isAsset: true,
            layoutSizingHorizontal: 'FIXED',
            layoutSizingVertical: 'FIXED',
            width: 24,
            height: 24,
          },
        ],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="#F00" boxSize="24px">
  <Image boxSize="24px" src="/icons/ChildVector.svg" />
</Box>`,
    },
    {
      title: 'renders null for asset with only solid fills',
      node: {
        type: 'RECTANGLE',
        name: 'SolidAsset',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
          },
        ],
      } as unknown as RectangleNode,
      expected: `<Box bg="#F00" boxSize="24px" />`,
    },
    {
      title: 'renders frame with bound variable color',
      node: {
        type: 'FRAME',
        name: 'VariableFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
            boundVariables: {
              color: {
                id: 'var1',
                type: 'COLOR',
              },
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="$primaryColor" h="50px" w="100px" />`,
    },
    {
      title: 'renders svg asset with same color mask',
      node: {
        type: 'VECTOR',
        name: 'MaskIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
          },
        ],
      } as unknown as VectorNode,
      expected: `<Box
  bg="#F00"
  boxSize="24px"
  maskImage="url(/icons/MaskIcon.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
    },
    {
      title: 'renders svg asset with children same color',
      node: {
        type: 'FRAME',
        name: 'GroupIcon',
        children: [
          {
            type: 'VECTOR',
            name: 'Vector1',
            children: [],
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
            type: 'VECTOR',
            name: 'Vector2',
            children: [],
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
        ],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
      } as unknown as FrameNode,
      expected: `<Box
  bg="#F00"
  boxSize="24px"
  maskImage="url(/icons/GroupIcon.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
    },
    {
      title: 'renders svg asset with different color children',
      node: {
        type: 'FRAME',
        name: 'MixedIcon',
        children: [
          {
            type: 'VECTOR',
            name: 'Vector1',
            children: [],
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
            type: 'VECTOR',
            name: 'Vector2',
            children: [],
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
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
      } as unknown as FrameNode,
      expected: `<Image boxSize="24px" src="/icons/MixedIcon.svg" />`,
    },
    {
      title: 'renders svg asset with non-solid fill',
      node: {
        type: 'VECTOR',
        name: 'GradientIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as VectorNode,
      expected: `<Image boxSize="24px" src="/icons/GradientIcon.svg" />`,
    },
    {
      title: 'renders svg asset with invisible fill',
      node: {
        type: 'VECTOR',
        name: 'InvisibleIcon',
        children: [],
        isAsset: true,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
        fills: [
          {
            type: 'SOLID',
            visible: false,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
          },
        ],
      } as unknown as VectorNode,
      expected: `<Image boxSize="24px" src="/icons/InvisibleIcon.svg" />`,
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
      title: 'renders text with special characters',
      node: {
        type: 'TEXT',
        name: 'SpecialText',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 20,
        textAutoResize: 'NONE',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Text with {braces} & <tags>'),
            characters: 'Text with {braces} & <tags>',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
        characters: 'Text with {braces} & <tags>',
      } as unknown as TextNode,
      expected: `<Text
  color="#000"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  h="20px"
  letterSpacing="0px"
  lineHeight="1.5px"
  w="100px"
>
  Text with {"{"}braces{"}"} {"&"} {"<"}tags{">"}
</Text>`,
    },
    {
      title: 'renders text with leading and trailing spaces',
      node: {
        type: 'TEXT',
        name: 'SpacedText',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 20,
        textAutoResize: 'NONE',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('  spaced  '),
            characters: '  spaced  ',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
        characters: '  spaced  ',
      } as unknown as TextNode,
      expected: `<Text
  color="#000"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  h="20px"
  letterSpacing="0px"
  lineHeight="1.5px"
  w="100px"
>
  {"  "}spaced{"  "}
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
      title: 'renders ellipse with 50% border radius',
      node: {
        type: 'ELLIPSE',
        name: 'Circle',
        children: [],
        arcData: {
          innerRadius: 0,
        },
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 100,
      } as unknown as EllipseNode,
      expected: `<Box borderRadius="50%" boxSize="100px" />`,
    },
    {
      title: 'renders frame with stroke outline CENTER alignment',
      node: {
        type: 'FRAME',
        name: 'StrokeCenterFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        strokes: [
          {
            type: 'SOLID',
            color: { r: 0, g: 0, b: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: 2,
        strokeAlign: 'CENTER',
      } as unknown as FrameNode,
      expected: `<Box h="50px" outline="solid 2px #00F" outlineOffset="-1px" w="100px" />`,
    },
    {
      title: 'renders frame with stroke outline OUTSIDE alignment',
      node: {
        type: 'FRAME',
        name: 'StrokeOutsideFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 60,
        strokes: [
          {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: 3,
        strokeAlign: 'OUTSIDE',
      } as unknown as FrameNode,
      expected: `<Box h="60px" outline="solid 3px #F00" w="120px" />`,
    },
    {
      title: 'renders frame with stroke border INSIDE alignment',
      node: {
        type: 'FRAME',
        name: 'StrokeInsideFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 80,
        height: 40,
        strokes: [
          {
            type: 'SOLID',
            color: { r: 0, g: 1, b: 0 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: 1,
        strokeAlign: 'INSIDE',
      } as unknown as FrameNode,
      expected: `<Box border="solid 1px #0F0" h="40px" w="80px" />`,
    },
    {
      title: 'renders line with stroke outline',
      node: {
        type: 'LINE',
        name: 'StrokeLine',
        strokes: [
          {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: 2,
        strokeAlign: 'CENTER',
      } as unknown as LineNode,
      expected: `<Box boxSize="100%" maxW="calc(100% - 4px)" outline="solid 2px #F00" transform="translate(2px, -2px)" />`,
    },
    {
      title: 'renders frame with dashed stroke',
      node: {
        type: 'FRAME',
        name: 'DashedStrokeFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        strokes: [
          {
            type: 'SOLID',
            color: { r: 0, g: 0, b: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: 2,
        strokeAlign: 'CENTER',
        dashPattern: [5, 3],
      } as unknown as FrameNode,
      expected: `<Box h="50px" outline="dashed 2px #00F" outlineOffset="-1px" w="100px" />`,
    },
    {
      title: 'renders frame with page parent and width 1920',
      node: {
        type: 'FRAME',
        name: 'PageFrame',
        children: [],
        width: 1920,
        height: 1080,
        parent: {
          type: 'PAGE',
          name: 'Page 1',
        },
      } as unknown as FrameNode,
      expected: `<Box h="100%" />`,
    },
    {
      title: 'renders frame with section parent',
      node: {
        type: 'FRAME',
        name: 'SectionFrame',
        children: [],
        width: 100,
        height: 100,
        parent: {
          type: 'SECTION',
          name: 'Section 1',
        },
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%" />`,
    },
    {
      title: 'renders frame with vertical center align child width shrinker',
      node: {
        type: 'FRAME',
        name: 'Parent',
        inferredAutoLayout: {
          layoutMode: 'VERTICAL',
          counterAxisAlignItems: 'CENTER',
        },
        children: [
          {
            type: 'FRAME',
            name: 'Child',
            children: [],
            layoutSizingHorizontal: 'FILL',
            layoutSizingVertical: 'FIXED',
            height: 50,
            parent: {
              type: 'FRAME',
              inferredAutoLayout: {
                layoutMode: 'VERTICAL',
                counterAxisAlignItems: 'CENTER',
              },
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<VStack boxSize="100%">
  <Box h="50px" w="100%" />
</VStack>`,
    },
    {
      title: 'renders frame with horizontal center align child height shrinker',
      node: {
        type: 'FRAME',
        name: 'Parent',
        inferredAutoLayout: {
          layoutMode: 'HORIZONTAL',
          counterAxisAlignItems: 'CENTER',
        },
        children: [
          {
            type: 'FRAME',
            name: 'Child',
            children: [],
            layoutSizingHorizontal: 'FIXED',
            layoutSizingVertical: 'FILL',
            width: 50,
            parent: {
              type: 'FRAME',
              inferredAutoLayout: {
                layoutMode: 'HORIZONTAL',
                counterAxisAlignItems: 'CENTER',
              },
            },
          },
        ],
      } as unknown as FrameNode,
      expected: `<Flex boxSize="100%">
  <Box h="100%" w="50px" />
</Flex>`,
    },
    {
      title: 'renders frame with maxWidth child width shrinker',
      node: {
        type: 'FRAME',
        name: 'Parent',
        children: [
          {
            type: 'FRAME',
            name: 'Child',
            children: [],
            layoutSizingHorizontal: 'FILL',
            layoutSizingVertical: 'FIXED',
            height: 50,
            maxWidth: 200,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%">
  <Box h="50px" maxW="200px" w="100%" />
</Box>`,
    },
    {
      title: 'renders frame with maxHeight child height shrinker',
      node: {
        type: 'FRAME',
        name: 'Parent',
        children: [
          {
            type: 'FRAME',
            name: 'Child',
            children: [],
            layoutSizingHorizontal: 'FIXED',
            layoutSizingVertical: 'FILL',
            width: 50,
            maxHeight: 200,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box boxSize="100%">
  <Box h="100%" maxH="200px" w="50px" />
</Box>`,
    },
    {
      title: 'renders frame with individual stroke weights',
      node: {
        type: 'FRAME',
        name: 'IndividualStrokeFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 120,
        height: 80,
        strokes: [
          {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
            visible: true,
          },
        ],
        strokeWeight: figma.mixed,
        strokeTopWeight: 1,
        strokeRightWeight: 2,
        strokeBottomWeight: 3,
        strokeLeftWeight: 4,
        strokeAlign: 'INSIDE',
      } as unknown as FrameNode,
      expected: `<Box
  borderBottom="solid 3px #F00"
  borderLeft="solid 4px #F00"
  borderRight="solid 2px #F00"
  borderTop="solid 1px #F00"
  h="80px"
  w="120px"
/>`,
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
  WebkitTextStroke="2px #00F"
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
      title: 'renders text node with multiple segments',
      node: {
        type: 'TEXT',
        name: 'MultiSegmentText',
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
          {
            ...createTextSegment('World'),
            characters: 'World',
            textStyleId: 'style2',
            fontSize: 20,
            fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 1 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  boxSize="100%"
  color="#00F"
  fontFamily="Arial"
  fontSize="20px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
>
  <Text color="#F00" fontSize="16px">
    Hello
  </Text>
  World
</Text>`,
    },
    {
      title: 'renders text node with unordered list',
      node: {
        type: 'TEXT',
        name: 'UnorderedListText',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Item 1'),
            characters: 'Item 1',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
            listOptions: {
              type: 'UNORDERED',
            },
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  as="ul"
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  my="0px"
  pl="1.5em"
>
  <li>
    Item 1
  </li>
</Text>`,
    },
    {
      title: 'renders text node with ordered list',
      node: {
        type: 'TEXT',
        name: 'OrderedListText',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Item 1'),
            characters: 'Item 1',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
            listOptions: {
              type: 'ORDERED',
            },
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  as="ol"
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  my="0px"
  pl="1.5em"
>
  <li>
    Item 1
  </li>
</Text>`,
    },
    {
      title: 'renders text node with list and multiple lines',
      node: {
        type: 'TEXT',
        name: 'MultiLineListText',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Item 1\nItem 2'),
            characters: 'Item 1\nItem 2',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
            listOptions: {
              type: 'UNORDERED',
            },
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  as="ul"
  boxSize="100%"
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  my="0px"
  pl="1.5em"
>
  <li>
    Item 1
  </li>
  <li>
    Item 2
  </li>
</Text>`,
    },
    {
      title: 'renders text node with multiple segments without props',
      node: {
        type: 'TEXT',
        name: 'MultiSegmentNoPropsText',
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
  Hello
  World
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
    {
      title: 'renders frame with opacity less than 1',
      node: {
        type: 'FRAME',
        name: 'OpacityFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 0.5,
        blendMode: 'NORMAL',
      } as unknown as FrameNode,
      expected: `<Box h="50px" opacity="0.5" w="100px" />`,
    },
    {
      title: 'renders frame with darken blend mode',
      node: {
        type: 'FRAME',
        name: 'DarkenBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'DARKEN',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="darken" w="100px" />`,
    },
    {
      title: 'renders frame with multiply blend mode',
      node: {
        type: 'FRAME',
        name: 'MultiplyBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'MULTIPLY',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="multiply" w="100px" />`,
    },
    {
      title: 'renders frame with screen blend mode',
      node: {
        type: 'FRAME',
        name: 'ScreenBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'SCREEN',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="screen" w="100px" />`,
    },
    {
      title: 'renders frame with overlay blend mode',
      node: {
        type: 'FRAME',
        name: 'OverlayBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'OVERLAY',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="overlay" w="100px" />`,
    },
    {
      title: 'renders frame with linear burn blend mode',
      node: {
        type: 'FRAME',
        name: 'LinearBurnBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'LINEAR_BURN',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="linearBurn" w="100px" />`,
    },
    {
      title: 'renders frame with color burn blend mode',
      node: {
        type: 'FRAME',
        name: 'ColorBurnBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'COLOR_BURN',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="colorBurn" w="100px" />`,
    },
    {
      title: 'renders frame with lighten blend mode',
      node: {
        type: 'FRAME',
        name: 'LightenBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'LIGHTEN',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="lighten" w="100px" />`,
    },
    {
      title: 'renders frame with linear dodge blend mode',
      node: {
        type: 'FRAME',
        name: 'LinearDodgeBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'LINEAR_DODGE',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="linear-dodge" w="100px" />`,
    },
    {
      title: 'renders frame with color dodge blend mode',
      node: {
        type: 'FRAME',
        name: 'ColorDodgeBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'COLOR_DODGE',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="color-dodge" w="100px" />`,
    },
    {
      title: 'renders frame with soft light blend mode',
      node: {
        type: 'FRAME',
        name: 'SoftLightBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'SOFT_LIGHT',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="soft-light" w="100px" />`,
    },
    {
      title: 'renders frame with hard light blend mode',
      node: {
        type: 'FRAME',
        name: 'HardLightBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'HARD_LIGHT',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="hard-light" w="100px" />`,
    },
    {
      title: 'renders frame with difference blend mode',
      node: {
        type: 'FRAME',
        name: 'DifferenceBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'DIFFERENCE',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="difference" w="100px" />`,
    },
    {
      title: 'renders frame with exclusion blend mode',
      node: {
        type: 'FRAME',
        name: 'ExclusionBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'EXCLUSION',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="exclusion" w="100px" />`,
    },
    {
      title: 'renders frame with hue blend mode',
      node: {
        type: 'FRAME',
        name: 'HueBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'HUE',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="hue" w="100px" />`,
    },
    {
      title: 'renders frame with saturation blend mode',
      node: {
        type: 'FRAME',
        name: 'SaturationBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'SATURATION',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="saturation" w="100px" />`,
    },
    {
      title: 'renders frame with color blend mode',
      node: {
        type: 'FRAME',
        name: 'ColorBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'COLOR',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="color" w="100px" />`,
    },
    {
      title: 'renders frame with luminosity blend mode',
      node: {
        type: 'FRAME',
        name: 'LuminosityBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'LUMINOSITY',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="luminosity" w="100px" />`,
    },
    {
      title: 'renders frame with pass through blend mode',
      node: {
        type: 'FRAME',
        name: 'PassThroughBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 1,
        blendMode: 'PASS_THROUGH',
      } as unknown as FrameNode,
      expected: `<Box h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with opacity and blend mode',
      node: {
        type: 'FRAME',
        name: 'OpacityBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        opacity: 0.75,
        blendMode: 'MULTIPLY',
      } as unknown as FrameNode,
      expected: `<Box h="50px" mixBlendMode="multiply" opacity="0.75" w="100px" />`,
    },
    {
      title: 'renders frame with solid fill and blend mode',
      node: {
        type: 'FRAME',
        name: 'SolidBlendFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'SOLID',
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
            visible: true,
            blendMode: 'MULTIPLY',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="#F00" bgBlendMode="multiply" h="50px" w="100px" />`,
    },
    {
      title: 'renders text node with gradient fill',
      node: {
        type: 'TEXT',
        name: 'GradientText',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        width: 100,
        height: 50,
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Gradient'),
            characters: 'Gradient',
            textStyleId: 'style1',
            fills: [
              {
                type: 'GRADIENT_LINEAR',
                visible: true,
                opacity: 1,
                gradientStops: [
                  { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
                ],
                gradientTransform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
              },
            ],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  bg="linear-gradient(90deg, #F00 0%, #00F 100%)"
  bgClip="text"
  boxSize="100%"
  color="linear-gradient(90deg, #F00 0%, #00F 100%)"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
>
  Gradient
</Text>`,
    },
    {
      title: 'renders text node with HEIGHT auto resize and fixed sizing',
      node: {
        type: 'TEXT',
        name: 'TextHeightFixed',
        children: [],
        textAutoResize: 'HEIGHT',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Height'),
            characters: 'Height',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  letterSpacing="0px"
  lineHeight="1.5px"
  w="100px"
>
  Height
</Text>`,
    },
    {
      title: 'renders text node with NONE auto resize and fixed sizing',
      node: {
        type: 'TEXT',
        name: 'TextNoneFixed',
        children: [],
        textAutoResize: 'NONE',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('None'),
            characters: 'None',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  h="50px"
  letterSpacing="0px"
  lineHeight="1.5px"
  w="100px"
>
  None
</Text>`,
    },
    {
      title: 'renders text node with TRUNCATE auto resize and fixed sizing',
      node: {
        type: 'TEXT',
        name: 'TextTruncateFixed',
        children: [],
        textAutoResize: 'TRUNCATE',
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Truncate'),
            characters: 'Truncate',
            textStyleId: 'style1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text
  color="#F00"
  fontFamily="Arial"
  fontSize="16px"
  fontWeight="400"
  h="50px"
  letterSpacing="0px"
  lineHeight="1.5px"
  w="100px"
>
  Truncate
</Text>`,
    },
    {
      title: 'renders text node with textStyleId and typography',
      node: {
        type: 'TEXT',
        name: 'TypographyText',
        children: [],
        textAutoResize: 'HEIGHT',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [
          {
            ...createTextSegment('Heading'),
            characters: 'Heading',
            textStyleId: 'text-style-1',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
          },
        ],
        textTruncation: 'DISABLED',
      } as unknown as TextNode,
      expected: `<Text boxSize="100%" color="#F00" typography="heading">
  Heading
</Text>`,
    },
    {
      title: 'renders frame with linear gradient fill',
      node: {
        type: 'FRAME',
        name: 'LinearGradientFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="linear-gradient(90deg, #F00 0%, #00F 100%)" h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with radial gradient fill',
      node: {
        type: 'FRAME',
        name: 'RadialGradientFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 100,
        fills: [
          {
            type: 'GRADIENT_RADIAL',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="radial-gradient(50% 50% at 50% 50%, #F00 0%, #00F 100%)" boxSize="100px" />`,
    },
    {
      title: 'renders frame with angular gradient fill',
      node: {
        type: 'FRAME',
        name: 'AngularGradientFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 100,
        fills: [
          {
            type: 'GRADIENT_ANGULAR',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 0.5, color: { r: 0, g: 1, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="conic-gradient(from 90deg at 50% 50%, #F00 0%, #0F0 50%, #00F 100%)" boxSize="100px" />`,
    },
    {
      title: 'renders frame with diamond gradient fill',
      node: {
        type: 'FRAME',
        name: 'DiamondGradientFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 100,
        fills: [
          {
            type: 'GRADIENT_DIAMOND',
            visible: true,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="linear-gradient(to bottom right, #F00 0%, #00F 50%) bottom right / 50.1% 50.1% no-repeat, linear-gradient(to bottom left, #F00 0%, #00F 50%) bottom left / 50.1% 50.1% no-repeat, linear-gradient(to top left, #F00 0%, #00F 50%) top left / 50.1% 50.1% no-repeat, linear-gradient(to top right, #F00 0%, #00F 50%) top right / 50.1% 50.1% no-repeat" boxSize="100px" />`,
    },
    {
      title: 'renders frame with image fill TILE scaleMode',
      node: {
        type: 'FRAME',
        name: 'TileImageFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'IMAGE',
            visible: true,
            opacity: 1,
            scaleMode: 'TILE',
            imageHash: 'hash123',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="url(/icons/image.png) repeat" h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with pattern fill',
      node: {
        type: 'FRAME',
        name: 'PatternFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'PATTERN',
            visible: true,
            opacity: 1,
            sourceNodeId: 'pattern-node-id',
            spacing: { x: 0.1, y: 0.2 },
            horizontalAlignment: 'CENTER',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="url(/icons/PatternIcon.svg) center 10% top 20% repeat" h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with pattern fill START alignment',
      node: {
        type: 'FRAME',
        name: 'PatternStartFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'PATTERN',
            visible: true,
            opacity: 1,
            sourceNodeId: 'pattern-node-id',
            spacing: { x: 0, y: 0 },
            horizontalAlignment: 'START',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="url(/icons/PatternIcon.svg) repeat" h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with pattern fill vertical alignment',
      node: {
        type: 'FRAME',
        name: 'PatternVerticalFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'PATTERN',
            visible: true,
            opacity: 1,
            sourceNodeId: 'pattern-node-id',
            spacing: { x: 0.1, y: 0.2 },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'END',
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="url(/icons/PatternIcon.svg) center 10% bottom 20% repeat" h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with multiple fills including non-last solid',
      node: {
        type: 'FRAME',
        name: 'MultipleFillsFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0, g: 1, b: 0 },
            opacity: 1,
          },
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 1,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box bg="linear-gradient(#F00, #F00), #0F0" h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with invisible gradient fill',
      node: {
        type: 'FRAME',
        name: 'InvisibleGradientFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'GRADIENT_LINEAR',
            visible: false,
            opacity: 1,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with zero opacity gradient fill',
      node: {
        type: 'FRAME',
        name: 'ZeroOpacityGradientFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'GRADIENT_RADIAL',
            visible: true,
            opacity: 0,
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box h="50px" w="100px" />`,
    },
    {
      title: 'renders frame with solid fill opacity 0',
      node: {
        type: 'FRAME',
        name: 'SolidOpacityZeroFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 1, g: 0, b: 0 },
            opacity: 0,
          },
        ],
      } as unknown as FrameNode,
      expected: `<Box h="50px" w="100px" />`,
    },
  ])('$title', async ({ node, expected }) => {
    addParent(node)
    const codegen = new Codegen(node)
    await codegen.run()
    expect(codegen.getCode()).toBe(expected)
  })

  type ComponentTestCase = {
    title: string
    node: SceneNode
    expected: string
    expectedComponents: Array<[string, string]>
  }

  test.each<ComponentTestCase>([
    {
      title: 'renders component set with variants',
      node: (() => {
        const defaultVariant = {
          type: 'COMPONENT',
          name: 'Default',
          children: [],
          variantProperties: { state: 'default' },
          reactions: [],
        } as unknown as ComponentNode
        const hoverVariant = {
          type: 'COMPONENT',
          name: 'Hover',
          children: [],
          variantProperties: { state: 'hover' },
          reactions: [
            {
              trigger: { type: 'ON_HOVER' },
              actions: [],
            },
          ],
        } as unknown as ComponentNode
        return {
          type: 'COMPONENT_SET',
          name: 'Button',
          children: [defaultVariant, hoverVariant],
          defaultVariant,
          componentPropertyDefinitions: {
            state: {
              type: 'VARIANT',
              variantOptions: ['default', 'hover'],
            },
          },
        } as unknown as ComponentSetNode
      })(),
      expected: `<Box boxSize="100%">
  <Box boxSize="100%" />
  <Box boxSize="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export interface ButtonProps {
  state: default | hover
}

export function Button() {
  return <Box boxSize="100%" />
 }`,
        ],
      ],
    },
    {
      title: 'renders component set with effect property',
      node: (() => {
        const defaultVariant = {
          type: 'COMPONENT',
          name: 'Default',
          children: [],
          variantProperties: { effect: 'default' },
          reactions: [],
        } as unknown as ComponentNode
        const hoverVariant = {
          type: 'COMPONENT',
          name: 'Hover',
          children: [],
          variantProperties: { effect: 'hover' },
          reactions: [],
        } as unknown as ComponentNode
        return {
          type: 'COMPONENT_SET',
          name: 'Button',
          children: [defaultVariant, hoverVariant],
          defaultVariant,
          componentPropertyDefinitions: {
            effect: {
              type: 'VARIANT',
              variantOptions: ['default', 'hover'],
            },
          },
        } as unknown as ComponentSetNode
      })(),
      expected: `<Box boxSize="100%">
  <Box boxSize="100%" />
  <Box boxSize="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box boxSize="100%" />
 }`,
        ],
      ],
    },
    {
      title: 'renders component set with transition',
      node: (() => {
        const defaultVariant = {
          type: 'COMPONENT',
          name: 'Default',
          children: [],
          variantProperties: {},
          reactions: [
            {
              trigger: { type: 'ON_HOVER' },
              actions: [
                {
                  type: 'NODE',
                  transition: {
                    type: 'SMART_ANIMATE',
                    duration: 0.3,
                    easing: { type: 'EASE_IN_OUT' },
                  },
                },
              ],
            },
          ],
        } as unknown as ComponentNode
        const hoverVariant = {
          type: 'COMPONENT',
          name: 'Hover',
          children: [],
          variantProperties: {},
          reactions: [
            {
              trigger: { type: 'ON_HOVER' },
              actions: [
                {
                  type: 'NODE',
                  transition: {
                    type: 'SMART_ANIMATE',
                    duration: 0.3,
                    easing: { type: 'EASE_IN_OUT' },
                  },
                },
              ],
            },
          ],
        } as unknown as ComponentNode
        return {
          type: 'COMPONENT_SET',
          name: 'Button',
          children: [defaultVariant, hoverVariant],
          defaultVariant,
          componentPropertyDefinitions: {},
        } as unknown as ComponentSetNode
      })(),
      expected: `<Box boxSize="100%">
  <Box boxSize="100%" />
  <Box boxSize="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box boxSize="100%" />
 }`,
        ],
      ],
    },
    {
      title: 'renders component set with different props and transition',
      node: (() => {
        const defaultVariant = {
          type: 'COMPONENT',
          name: 'Default',
          children: [],
          variantProperties: {},
          reactions: [
            {
              trigger: { type: 'ON_HOVER' },
              actions: [
                {
                  type: 'NODE',
                  transition: {
                    type: 'SMART_ANIMATE',
                    duration: 0.3,
                    easing: { type: 'EASE_IN_OUT' },
                  },
                },
              ],
            },
          ],
        } as unknown as ComponentNode
        const hoverVariant = {
          type: 'COMPONENT',
          name: 'Hover',
          children: [],
          variantProperties: {},
          opacity: 0.8,
          reactions: [
            {
              trigger: { type: 'ON_HOVER' },
              actions: [
                {
                  type: 'NODE',
                  transition: {
                    type: 'SMART_ANIMATE',
                    duration: 0.3,
                    easing: { type: 'EASE_IN_OUT' },
                  },
                },
              ],
            },
          ],
        } as unknown as ComponentNode
        return {
          type: 'COMPONENT_SET',
          name: 'Card',
          children: [defaultVariant, hoverVariant],
          defaultVariant,
          componentPropertyDefinitions: {},
        } as unknown as ComponentSetNode
      })(),
      expected: `<Box boxSize="100%">
  <Box boxSize="100%" />
  <Box boxSize="100%" opacity="0.8" />
</Box>`,
      expectedComponents: [
        [
          'Card',
          `export function Card() {
  return (
    <Box
      _hover={{
        "opacity": "0.8"
      }}
      boxSize="100%"
      transition="0.3ms ease-in-out"
      transitionProperty="opacity"
    />
  )
 }`,
        ],
      ],
    },
    {
      title: 'renders component with parent component set',
      node: {
        type: 'COMPONENT',
        name: 'Hover',
        parent: {
          type: 'COMPONENT_SET',
          name: 'Button',
          children: [
            {
              type: 'COMPONENT',
              name: 'Default',
              children: [],
              variantProperties: { state: 'default' },
              reactions: [],
            },
            {
              type: 'COMPONENT',
              name: 'Hover',
              children: [],
              variantProperties: { state: 'hover' },
              reactions: [
                {
                  trigger: { type: 'ON_HOVER' },
                  actions: [],
                },
              ],
            },
          ],
          defaultVariant: {
            type: 'COMPONENT',
            name: 'Default',
            children: [],
            variantProperties: { state: 'default' },
            reactions: [],
          },
          componentPropertyDefinitions: {
            state: {
              type: 'VARIANT',
              variantOptions: ['default', 'hover'],
            },
          },
        },
        children: [],
        variantProperties: { state: 'hover' },
        reactions: [
          {
            trigger: { type: 'ON_HOVER' },
            actions: [],
          },
        ],
      } as unknown as ComponentNode,
      expected: `<Box boxSize="100%">
  <Box boxSize="100%" />
  <Box boxSize="100%" />
</Box>`,
      expectedComponents: [],
    },
    {
      title: 'renders component set with press trigger',
      node: (() => {
        const defaultVariant = {
          type: 'COMPONENT',
          name: 'Default',
          children: [],
          variantProperties: {},
          reactions: [],
        } as unknown as ComponentNode
        const activeVariant = {
          type: 'COMPONENT',
          name: 'Active',
          children: [],
          variantProperties: {},
          reactions: [
            {
              trigger: { type: 'ON_PRESS' },
              actions: [],
            },
          ],
        } as unknown as ComponentNode
        return {
          type: 'COMPONENT_SET',
          name: 'Button',
          children: [defaultVariant, activeVariant],
          defaultVariant,
          componentPropertyDefinitions: {},
        } as unknown as ComponentSetNode
      })(),
      expected: `<Box boxSize="100%">
  <Box boxSize="100%" />
  <Box boxSize="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box boxSize="100%" />
 }`,
        ],
      ],
    },
    {
      title: 'renders simple component without variants',
      node: {
        type: 'COMPONENT',
        name: 'Icon',
        children: [],
      } as unknown as ComponentNode,
      expected: `<Box boxSize="100%" />`,
      expectedComponents: [
        [
          'Icon',
          `export function Icon() {
  return <Box boxSize="100%" />
 }`,
        ],
      ],
    },
    {
      title: 'renders component with parent component set name',
      node: {
        type: 'COMPONENT',
        name: 'Hover',
        parent: {
          type: 'COMPONENT_SET',
          name: 'Button',
          children: [],
        },
        children: [],
      } as unknown as ComponentNode,
      expected: `<Box boxSize="100%" />`,
      expectedComponents: [],
    },
  ])('$title', async ({ node, expected, expectedComponents }) => {
    addParent(node)
    const codegen = new Codegen(node)
    await codegen.run()
    const componentsCodes = codegen.getComponentsCodes()
    expect(codegen.getCode()).toBe(expected)
    expect(componentsCodes).toEqual(expectedComponents)
  })
})
