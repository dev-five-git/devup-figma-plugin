import { afterAll, describe, expect, it, test } from 'bun:test'
import { Codegen } from '../Codegen'
import { assembleNodeTree, type NodeData } from '../utils/node-proxy'

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

function addVisibleToAll(node: SceneNode, visited = new Set<SceneNode>()) {
  if (visited.has(node)) return
  visited.add(node)
  if (!('visible' in node)) {
    ;(node as unknown as { visible: boolean }).visible = true
  }
  if ('children' in node) {
    for (const child of node.children) {
      addVisibleToAll(child, visited)
    }
  }
  if ('parent' in node && node.parent) {
    addVisibleToAll(node.parent as SceneNode, visited)
  }
  if ('defaultVariant' in node && node.defaultVariant) {
    addVisibleToAll(node.defaultVariant as SceneNode, visited)
  }
}

function addParent(parent: SceneNode) {
  addVisibleToAll(parent)
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
      expected: `<Image h="80px" objectFit="contain" src="/images/ObjectFitContain.png" w="100px" />`,
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
      expected: `<Image h="90px" objectFit="cover" src="/images/ObjectFitCover.png" w="120px" />`,
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
      expected: `<Image h="70px" src="/images/ObjectFitFill.png" w="110px" />`,
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
      title: 'renders nested svg asset with 3 solid fill boxes in frame',
      node: {
        type: 'FRAME',
        name: 'NestedIcon',
        children: [
          {
            type: 'RECTANGLE',
            name: 'Box1',
            children: [],
            visible: true,
            isAsset: false,
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
            name: 'Box2',
            children: [],
            visible: true,
            isAsset: false,
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
            name: 'Box3',
            children: [],
            visible: true,
            isAsset: false,
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
        isAsset: false,
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 24,
        height: 24,
      } as unknown as FrameNode,
      expected: `<Box
  bg="#F00"
  boxSize="24px"
  maskImage="url(/icons/NestedIcon.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
    },
    {
      title: 'renders nested svg asset with different colors as image',
      node: {
        type: 'FRAME',
        name: 'NestedMultiColorIcon',
        children: [
          {
            type: 'RECTANGLE',
            name: 'Box1',
            children: [],
            visible: true,
            isAsset: false,
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
            name: 'Box2',
            children: [],
            visible: true,
            isAsset: false,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 0, g: 1, b: 0 },
                opacity: 1,
              },
            ],
          },
          {
            type: 'RECTANGLE',
            name: 'Box3',
            children: [],
            visible: true,
            isAsset: false,
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
      expected: `<Image boxSize="24px" src="/icons/NestedMultiColorIcon.svg" />`,
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
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            constraints: {
              horizontal: 'MIN',
              vertical: 'MIN',
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
  <Box h="100%" pos="absolute" right="0px" top="50px" />
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
    h="100%"
    left="50%"
    pos="absolute"
    top="50%"
    transform="translate(-50%, -50%)"
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
  <Box bottom="0px" h="100%" left="50px" pos="absolute" />
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
    h="100%"
    left="300px"
    pos="absolute"
    top="50%"
    transform="translateY(-50%)"
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
      title: 'renders padding from inferredAutoLayout',
      node: {
        type: 'FRAME',
        name: 'InferredPaddingFrame',
        children: [],
        layoutSizingHorizontal: 'FIXED',
        layoutSizingVertical: 'FIXED',
        width: 100,
        height: 50,
        inferredAutoLayout: {
          paddingTop: 10,
          paddingRight: 20,
          paddingBottom: 10,
          paddingLeft: 20,
        },
      } as unknown as FrameNode,
      expected: `<Box h="50px" px="20px" py="10px" w="100px" />`,
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
      expected: `<Box h="100%" />`,
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
  <Box boxSize="100%" />
  <Box boxSize="100%" />
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
      expected: `<VStack alignItems="center" h="200px" justifyContent="space-between" w="120px">
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
      expected: `<Box backdropFilter="blur(8px)" h="90px" w="110px" />`,
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
      expected: `<Box backdropFilter="blur(12px)" h="80px" w="160px" />`,
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
      expected: `<Box h="50px" transform="rotate(-45deg)" w="100px" />`,
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
      // revsered rotation
      expected: `<Box h="40px" transform="rotate(30deg)" w="80px" />`,
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
      expected: `<Box h="60px" transform="rotate(-15.5deg)" w="120px" />`,
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
  <Box h="100%" />
  <Box h="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export interface ButtonProps {
  state: 'default' | 'hover'
}

export function Button({ state }: ButtonProps) {
  return <Box h="100%" />
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
  <Box h="100%" />
  <Box h="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box h="100%" />
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
  <Box h="100%" />
  <Box h="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box h="100%" />
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
  <Box h="100%" />
  <Box h="100%" opacity="0.8" />
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
      h="100%"
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
      expected: `<Box h="100%" />`,
      expectedComponents: [
        [
          'Button',
          `export interface ButtonProps {
  state: 'default' | 'hover'
}

export function Button({ state }: ButtonProps) {
  return <Box h="100%" />
}`,
        ],
      ],
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
  <Box h="100%" />
  <Box h="100%" />
</Box>`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box h="100%" />
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
          componentPropertyDefinitions: {},
          defaultVariant: {
            type: 'COMPONENT',
            name: 'Default',
            children: [],
          },
        },
        children: [],
      } as unknown as ComponentNode,
      expected: `<Box h="100%" />`,
      expectedComponents: [
        [
          'Button',
          `export function Button() {
  return <Box h="100%" />
}`,
        ],
      ],
    },
  ])('$title', async ({ node, expected, expectedComponents }) => {
    addParent(node)
    const codegen = new Codegen(node)
    await codegen.run()
    const componentsCodes = codegen.getComponentsCodes()
    expect(codegen.getCode()).toBe(expected)
    expect(componentsCodes).toEqual(expectedComponents)
  })

  test('renders instance with page root width and sets width to 100%', async () => {
    const mainComponent = {
      type: 'COMPONENT',
      name: 'TestComponent',
      children: [],
      getMainComponentAsync: async () => null,
    } as unknown as ComponentNode

    const pageNode = {
      type: 'PAGE',
    } as unknown as PageNode

    const pageRootNode = {
      type: 'FRAME',
      name: 'PageRoot',
      parent: pageNode,
      width: 1440,
      height: 900,
    } as unknown as FrameNode

    const instanceNode = {
      type: 'INSTANCE',
      name: 'TestInstance',
      parent: pageRootNode,
      width: 1440,
      height: 100,
      x: 100,
      y: 50,
      getMainComponentAsync: async () => mainComponent,
      layoutPositioning: 'ABSOLUTE',
      constraints: {
        horizontal: 'MIN',
        vertical: 'MIN',
      },
    } as unknown as InstanceNode

    const codegen = new Codegen(instanceNode)
    await codegen.run()
    const code = codegen.getCode()

    expect(code).toContain('w="100%"')
  })

  test('renders instance without page root width match and does not set width to 100%', async () => {
    const mainComponent = {
      type: 'COMPONENT',
      name: 'TestComponent',
      children: [],
      getMainComponentAsync: async () => null,
    } as unknown as ComponentNode

    const pageNode = {
      type: 'PAGE',
    } as unknown as PageNode

    const pageRootNode = {
      type: 'FRAME',
      name: 'PageRoot',
      parent: pageNode,
      width: 1440,
      height: 900,
    } as unknown as FrameNode

    const instanceNode = {
      type: 'INSTANCE',
      name: 'TestInstance',
      parent: pageRootNode,
      width: 800,
      height: 100,
      x: 100,
      y: 50,
      getMainComponentAsync: async () => mainComponent,
      layoutPositioning: 'ABSOLUTE',
      constraints: {
        horizontal: 'MIN',
        vertical: 'MIN',
      },
    } as unknown as InstanceNode

    const codegen = new Codegen(instanceNode)
    await codegen.run()
    const code = codegen.getCode()

    expect(code).not.toContain('w="100%"')
  })
})

describe('Codegen Tree Methods', () => {
  describe('buildTree', () => {
    test('builds tree for simple frame', async () => {
      const node = {
        type: 'FRAME',
        name: 'SimpleFrame',
        children: [],
        visible: true,
      } as unknown as FrameNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Box')
      expect(tree.nodeType).toBe('FRAME')
      expect(tree.nodeName).toBe('SimpleFrame')
      expect(tree.children).toEqual([])
    })

    test('builds tree for asset node (image)', async () => {
      const node = {
        type: 'RECTANGLE',
        name: 'TestImage',
        isAsset: true,
        children: [],
        visible: true,
        fills: [
          {
            type: 'IMAGE',
            visible: true,
          },
        ],
      } as unknown as RectangleNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Image')
      expect(tree.props.src).toBe('/images/TestImage.png')
      expect(tree.nodeType).toBe('RECTANGLE')
    })

    test('builds tree for SVG asset with mask color', async () => {
      const node = {
        type: 'VECTOR',
        name: 'TestIcon',
        isAsset: true,
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
      } as unknown as VectorNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Box')
      expect(tree.props.maskImage).toBe('url(/icons/TestIcon.svg)')
      expect(tree.props.maskRepeat).toBe('no-repeat')
      expect(tree.props.maskSize).toBe('contain')
      expect(tree.props.bg).toBe('#F00')
      expect(tree.props.src).toBeUndefined()
    })

    test('builds tree for SVG asset without same color (returns Image)', async () => {
      const node = {
        type: 'FRAME',
        name: 'MultiColorIcon',
        isAsset: true,
        children: [
          {
            type: 'VECTOR',
            name: 'Part1',
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
            name: 'Part2',
            visible: true,
            fills: [
              {
                type: 'SOLID',
                visible: true,
                color: { r: 0, g: 1, b: 0 },
                opacity: 1,
              },
            ],
          },
        ],
        visible: true,
        fills: [],
      } as unknown as FrameNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Image')
      expect(tree.props.src).toBe('/icons/MultiColorIcon.svg')
    })

    test('builds tree for frame with children', async () => {
      const child1 = {
        type: 'FRAME',
        name: 'Child1',
        children: [],
        visible: true,
      } as unknown as FrameNode

      const child2 = {
        type: 'FRAME',
        name: 'Child2',
        children: [],
        visible: true,
      } as unknown as FrameNode

      const node = {
        type: 'FRAME',
        name: 'ParentFrame',
        children: [child1, child2],
        visible: true,
        inferredAutoLayout: {
          layoutMode: 'HORIZONTAL',
          itemSpacing: 8,
        },
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
      } as unknown as FrameNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Flex')
      expect(tree.children.length).toBe(2)
      expect(tree.children[0].nodeName).toBe('Child1')
      expect(tree.children[1].nodeName).toBe('Child2')
    })

    test('builds tree for TEXT node', async () => {
      const node = {
        type: 'TEXT',
        name: 'TextNode',
        characters: 'Hello World',
        visible: true,
        textAutoResize: 'WIDTH_AND_HEIGHT',
        textAlignHorizontal: 'LEFT',
        textAlignVertical: 'TOP',
        strokes: [],
        effects: [],
        getStyledTextSegments: () => [createTextSegment('Hello World')],
      } as unknown as TextNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Text')
      expect(tree.nodeType).toBe('TEXT')
      expect(tree.textChildren).toBeDefined()
    })

    test('builds tree for INSTANCE node without position wrapper', async () => {
      const mainComponent = {
        type: 'COMPONENT',
        name: 'MainComponent',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(mainComponent)

      const instanceNode = {
        type: 'INSTANCE',
        name: 'InstanceNode',
        visible: true,
        getMainComponentAsync: async () => mainComponent,
      } as unknown as InstanceNode
      addParent(instanceNode)

      const codegen = new Codegen(instanceNode)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('MainComponent')
      expect(tree.isComponent).toBe(true)
      expect(tree.props).toEqual({})
    })

    test('builds tree for INSTANCE node with position wrapper (absolute)', async () => {
      const mainComponent = {
        type: 'COMPONENT',
        name: 'AbsoluteComponent',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(mainComponent)

      const parent = {
        type: 'FRAME',
        name: 'Parent',
        children: [],
        visible: true,
        width: 500,
      } as unknown as FrameNode

      const instanceNode = {
        type: 'INSTANCE',
        name: 'AbsoluteInstance',
        visible: true,
        width: 100,
        height: 50,
        x: 10,
        y: 20,
        layoutPositioning: 'ABSOLUTE',
        constraints: {
          horizontal: 'MIN',
          vertical: 'MIN',
        },
        getMainComponentAsync: async () => mainComponent,
        parent,
      } as unknown as InstanceNode

      ;(parent as unknown as { children: SceneNode[] }).children = [
        instanceNode,
      ]
      addParent(parent)

      const codegen = new Codegen(instanceNode)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Box')
      expect(tree.props.pos).toBe('absolute')
      expect(tree.children.length).toBe(1)
      expect(tree.children[0].component).toBe('AbsoluteComponent')
      expect(tree.children[0].isComponent).toBe(true)
    })

    test('builds tree for INSTANCE with position and 100% width', async () => {
      const mainComponent = {
        type: 'COMPONENT',
        name: 'FullWidthComponent',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(mainComponent)

      const page = {
        type: 'PAGE',
        name: 'Page',
        width: 200,
        parent: null,
      } as unknown as PageNode

      const parent = {
        type: 'FRAME',
        name: 'PageRoot',
        children: [],
        visible: true,
        width: 200,
        parent: page,
      } as unknown as FrameNode

      const instanceNode = {
        type: 'INSTANCE',
        name: 'FullWidthInstance',
        visible: true,
        width: 200,
        height: 50,
        x: 0,
        y: 0,
        layoutPositioning: 'ABSOLUTE',
        constraints: {
          horizontal: 'MIN',
          vertical: 'MIN',
        },
        getMainComponentAsync: async () => mainComponent,
        parent,
      } as unknown as InstanceNode

      ;(parent as unknown as { children: SceneNode[] }).children = [
        instanceNode,
      ]
      addParent(parent)

      const codegen = new Codegen(instanceNode)
      const tree = await codegen.buildTree()

      expect(tree.component).toBe('Box')
      expect(tree.props.w).toBe('100%')
    })

    test('builds tree for COMPONENT_SET node', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'Default',
        children: [],
        visible: true,
        reactions: [],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'ButtonSet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {},
      } as unknown as ComponentSetNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBeGreaterThan(0)
    })

    test('builds tree for COMPONENT node directly', async () => {
      const node = {
        type: 'COMPONENT',
        name: 'DirectComponent',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBeGreaterThan(0)
    })

    test('builds tree with nested INSTANCE children', async () => {
      const mainComponent = {
        type: 'COMPONENT',
        name: 'NestedComp',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(mainComponent)

      const instanceChild = {
        type: 'INSTANCE',
        name: 'NestedInstance',
        visible: true,
        getMainComponentAsync: async () => mainComponent,
      } as unknown as InstanceNode

      const parent = {
        type: 'FRAME',
        name: 'ParentWithInstance',
        children: [instanceChild],
        visible: true,
      } as unknown as FrameNode
      addParent(parent)

      const codegen = new Codegen(parent)
      const tree = await codegen.buildTree()

      expect(tree.children.length).toBe(1)
      expect(tree.children[0].isComponent).toBe(true)
    })
  })

  describe('getTree', () => {
    test('builds and caches tree on first call', async () => {
      const node = {
        type: 'FRAME',
        name: 'CachedFrame',
        children: [],
        visible: true,
      } as unknown as FrameNode
      addParent(node)

      const codegen = new Codegen(node)
      const tree1 = await codegen.getTree()
      const tree2 = await codegen.getTree()

      expect(tree1).toBe(tree2) // Same reference (cached)
      expect(tree1.nodeName).toBe('CachedFrame')
    })
  })

  describe('getComponentTrees', () => {
    test('returns empty map when no components', async () => {
      const node = {
        type: 'FRAME',
        name: 'NoComponents',
        children: [],
        visible: true,
      } as unknown as FrameNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBe(0)
    })

    test('returns component trees after building', async () => {
      const componentChild = {
        type: 'COMPONENT',
        name: 'ChildComp',
        children: [],
        visible: true,
      } as unknown as ComponentNode

      const defaultVariant = {
        type: 'COMPONENT',
        name: 'Default',
        children: [componentChild],
        visible: true,
        reactions: [],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'CompSet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {},
      } as unknown as ComponentSetNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBeGreaterThan(0)
    })
  })

  describe('addComponentTree (via buildTree)', () => {
    test('adds component with selector props', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: 'State=Default',
        children: [],
        visible: true,
        reactions: [],
      } as unknown as ComponentNode

      const hoverVariant = {
        type: 'COMPONENT',
        name: 'State=Hover',
        children: [],
        visible: true,
        reactions: [],
        fills: [
          {
            type: 'SOLID',
            visible: true,
            color: { r: 0, g: 0.5, b: 1 },
            opacity: 1,
          },
        ],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'ButtonWithHover',
        children: [defaultVariant, hoverVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {},
      } as unknown as ComponentSetNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBeGreaterThan(0)
    })

    test('does not duplicate component trees', async () => {
      const mainComponent = {
        type: 'COMPONENT',
        name: 'SharedComp',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(mainComponent)

      const instance1 = {
        type: 'INSTANCE',
        name: 'Instance1',
        visible: true,
        getMainComponentAsync: async () => mainComponent,
      } as unknown as InstanceNode

      const instance2 = {
        type: 'INSTANCE',
        name: 'Instance2',
        visible: true,
        getMainComponentAsync: async () => mainComponent,
      } as unknown as InstanceNode

      const parent = {
        type: 'FRAME',
        name: 'ParentWithDuplicates',
        children: [instance1, instance2],
        visible: true,
      } as unknown as FrameNode
      addParent(parent)

      const codegen = new Codegen(parent)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      // Should only have 1 entry for SharedComp, not duplicates
      expect(componentTrees.size).toBe(1)
    })

    test('handles component with INSTANCE children', async () => {
      const nestedComponent = {
        type: 'COMPONENT',
        name: 'NestedComp',
        children: [],
        visible: true,
      } as unknown as ComponentNode
      addParent(nestedComponent)

      const nestedInstance = {
        type: 'INSTANCE',
        name: 'NestedInstance',
        visible: true,
        getMainComponentAsync: async () => nestedComponent,
      } as unknown as InstanceNode

      const mainComponent = {
        type: 'COMPONENT',
        name: 'ParentComp',
        children: [nestedInstance],
        visible: true,
        reactions: [],
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'CompSetWithNestedInstance',
        children: [mainComponent],
        defaultVariant: mainComponent,
        visible: true,
        componentPropertyDefinitions: {},
      } as unknown as ComponentSetNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBe(2) // ParentComp and NestedComp
    })
  })

  describe('renderTree (static)', () => {
    test('renders simple tree to JSX', () => {
      const tree = {
        component: 'Box',
        props: { w: '100px', h: '50px' },
        children: [],
        nodeType: 'FRAME',
        nodeName: 'SimpleBox',
      }

      const result = Codegen.renderTree(tree)
      expect(result).toContain('<Box')
      expect(result).toContain('h="50px"')
      expect(result).toContain('w="100px"')
    })

    test('renders tree with children', () => {
      const tree = {
        component: 'Flex',
        props: { direction: 'column' },
        children: [
          {
            component: 'Box',
            props: { w: '100px' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Child1',
          },
          {
            component: 'Box',
            props: { h: '50px' },
            children: [],
            nodeType: 'FRAME',
            nodeName: 'Child2',
          },
        ],
        nodeType: 'FRAME',
        nodeName: 'Parent',
      }

      const result = Codegen.renderTree(tree)
      expect(result).toContain('<Flex')
      expect(result).toContain('direction="column"')
      expect(result).toContain('<Box')
    })

    test('renders tree with textChildren', () => {
      const tree = {
        component: 'Text',
        props: { fontSize: '16px' },
        children: [],
        nodeType: 'TEXT',
        nodeName: 'TextNode',
        textChildren: ['Hello', ' ', 'World'],
      }

      const result = Codegen.renderTree(tree)
      expect(result).toContain('<Text')
      expect(result).toContain('Hello')
      expect(result).toContain('World')
    })

    test('renders nested tree with depth', () => {
      const tree = {
        component: 'Flex',
        props: {},
        children: [
          {
            component: 'Flex',
            props: {},
            children: [
              {
                component: 'Box',
                props: {},
                children: [],
                nodeType: 'FRAME',
                nodeName: 'DeepChild',
              },
            ],
            nodeType: 'FRAME',
            nodeName: 'MiddleChild',
          },
        ],
        nodeType: 'FRAME',
        nodeName: 'Root',
      }

      const result = Codegen.renderTree(tree, 0)
      expect(result).toContain('<Flex')
      expect(result).toContain('<Box')
    })

    test('renders component reference (isComponent)', () => {
      const tree = {
        component: 'MyButton',
        props: {},
        children: [],
        nodeType: 'INSTANCE',
        nodeName: 'ButtonInstance',
        isComponent: true,
      }

      const result = Codegen.renderTree(tree)
      expect(result).toContain('<MyButton')
    })
  })

  describe('getSelectorProps with numeric property names', () => {
    test('sanitizes property name that is only digits', async () => {
      const defaultVariant = {
        type: 'COMPONENT',
        name: '123=Default',
        children: [],
        visible: true,
        reactions: [],
        variantProperties: { '123': 'Default' },
      } as unknown as ComponentNode

      const node = {
        type: 'COMPONENT_SET',
        name: 'NumericPropertySet',
        children: [defaultVariant],
        defaultVariant,
        visible: true,
        componentPropertyDefinitions: {
          '123': {
            type: 'VARIANT',
            variantOptions: ['Default', 'Active'],
          },
        },
      } as unknown as ComponentSetNode
      addParent(node)

      const codegen = new Codegen(node)
      await codegen.buildTree()

      // The numeric property name should be sanitized to 'variant'
      const componentTrees = codegen.getComponentTrees()
      expect(componentTrees.size).toBeGreaterThan(0)
    })
  })
})

describe('render real world component', () => {
  it.each([
    {
      expected: `<Box bg="#D9D9D9" borderRadius="20px" boxSize="150px" />`,
      nodes: [
        {
          id: '7:3',
          name: 'Rectangle 2',
          type: 'RECTANGLE',
          reactions: [],
          parent: '7:7',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          width: 150,
          height: 150,
          cornerRadius: 20,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          effects: [],
          rotation: 0,
          visible: true,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
        },
        {
          id: '7:7',
          name: 'BorderRadius',
          type: 'SECTION',
          children: ['7:3'],
        },
      ],
    },
    {
      expected:
        '<Box bg="#D9D9D9" borderRadius="20px 30px 50px 40px" boxSize="150px" />',
      nodes: [
        {
          id: '6:2',
          name: 'Rectangle 1',
          type: 'RECTANGLE',
          reactions: [],
          parent: '7:7',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          width: 150,
          height: 150,
          topLeftRadius: 20,
          topRightRadius: 30,
          bottomRightRadius: 50,
          bottomLeftRadius: 40,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
        },
        {
          id: '7:7',
          name: 'BorderRadius',
          type: 'SECTION',
          children: ['6:2'],
        },
      ],
    },
    {
      expected:
        '<Box bg="#D9D9D9" borderRadius="200px 30px" boxSize="150px" />',
      nodes: [
        {
          id: '7:5',
          name: 'Rectangle 3',
          type: 'RECTANGLE',
          visible: true,
          parent: '7:7',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 150,
          rotation: 0,
          topLeftRadius: 200,
          topRightRadius: 30,
          bottomLeftRadius: 30,
          bottomRightRadius: 200,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
        },
        {
          id: '7:7',
          name: 'BorderRadius',
          type: 'SECTION',
          children: ['7:5'],
        },
      ],
    },
    // gradient
    {
      expected: `<Flex
  bg="#FFF"
  h="223px"
  overflow="hidden"
  pb="22px"
  pl="57px"
  pr="118px"
  pt="51px"
>
  <Box bg="linear-gradient(-180deg, #8ADAFF 0%, #C6C9CE 100%)" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2019',
          name: 'Frame 1597884473',
          type: 'FRAME',
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 57,
            paddingRight: 118,
            paddingTop: 51,
            paddingBottom: 22,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          parent: '10:14',
          children: ['8:2'],
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          height: 223,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 325,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '8:2',
          name: 'Linear',
          type: 'FRAME',
          reactions: [],
          parent: '496:2019',
          children: [],
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.776627242565155,
                    g: 0.789053201675415,
                    b: 0.807692289352417,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [6.123234262925839e-17, 1, 0],
                [-1, 6.123234262925839e-17, 1],
              ],
            },
          ],
          isAsset: false,
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          width: 150,
          height: 150,
          cornerRadius: 1000,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2019'],
        },
      ],
    },
    {
      expected: `<Flex
  bg="#FFF"
  h="215px"
  overflow="hidden"
  pb="16px"
  pl="147px"
  pr="110px"
  pt="49px"
>
  <Box bg="linear-gradient(-47deg, #8ADAFF 29.62%, #C6C9CE 83.86%)" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2050',
          name: 'Frame 1597884474',
          type: 'FRAME',
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 147,
            paddingRight: 110,
            paddingTop: 49,
            paddingBottom: 16,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MAX',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          parent: '10:14',
          visible: true,
          children: ['14:23'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 407,
          height: 215,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
        },
        {
          id: '14:23',
          name: 'Linear',
          type: 'FRAME',
          reactions: [],
          parent: '496:2050',
          children: [],
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.776627242565155,
                    g: 0.789053201675415,
                    b: 0.807692289352417,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [-0.9584663510322571, -0.8847382068634033, 1.2973703145980835],
                [0.8847382068634033, -0.9584663510322571, 0.5272794365882874],
              ],
            },
          ],
          isAsset: false,
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          width: 150,
          height: 150,
          cornerRadius: 1000,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2050'],
        },
      ],
    },
    {
      expected: `<Flex
  bg="#FFF"
  h="254px"
  overflow="hidden"
  pb="34px"
  pl="102px"
  pr="110px"
  pt="70px"
>
  <Box bg="radial-gradient(50% 50% at 50% 50%, #8ADAFF 0%, #DDEAFF 100%)" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2051',
          name: 'Frame 1597884475',
          type: 'FRAME',
          reactions: [],
          parent: '10:14',
          children: ['8:6'],
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 102,
            paddingRight: 110,
            paddingTop: 70,
            paddingBottom: 34,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          height: 254,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 362,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '8:6',
          name: 'Radial',
          type: 'FRAME',
          visible: true,
          parent: '496:2051',
          children: [],
          fills: [
            {
              type: 'GRADIENT_RADIAL',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.8653846383094788,
                    g: 0.9192305207252502,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [6.123234262925839e-17, 1, 0],
                [-1, 6.123234262925839e-17, 1],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 150,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2051'],
        },
      ],
    },
    {
      expected: `<Flex
  bg="#FFF"
  h="259px"
  overflow="hidden"
  pb="26px"
  pl="152px"
  pr="100px"
  pt="83px"
>
  <Box bg="radial-gradient(43% 21% at 32% 39%, #8ADAFF 0%, #DDEAFF 100%)" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2054',
          name: 'Frame 1597884476',
          type: 'FRAME',
          visible: true,
          parent: '10:14',
          children: ['16:28'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 402,
          height: 259,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 152,
            paddingRight: 100,
            paddingTop: 83,
            paddingBottom: 26,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MAX',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '16:28',
          name: 'Radial',
          type: 'FRAME',
          visible: true,
          parent: '496:2054',
          children: [],
          fills: [
            {
              type: 'GRADIENT_RADIAL',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.8653846383094788,
                    g: 0.9192305207252502,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [-1.3973798751831055, 0.4803493320941925, 0.7598253488540649],
                [-0.4803493320941925, -1.3973798751831055, 1.1986899375915527],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 150,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2054'],
        },
      ],
    },
    {
      expected: `<Flex
  bg="#FFF"
  h="225px"
  overflow="hidden"
  pb="38px"
  pl="71px"
  pr="69px"
  pt="37px"
>
  <Box bg="conic-gradient(from 180deg at 50% 50%, #8ADAFF 0%, #DDEAFF 100%)" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2055',
          name: 'Frame 1597884477',
          type: 'FRAME',
          visible: true,
          parent: '10:14',
          children: ['10:2'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 290,
          height: 225,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 71,
            paddingRight: 69,
            paddingTop: 37,
            paddingBottom: 38,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:2',
          name: 'Conic',
          type: 'FRAME',
          visible: true,
          parent: '496:2055',
          children: [],
          fills: [
            {
              type: 'GRADIENT_ANGULAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.8653846383094788,
                    g: 0.9192305207252502,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [6.123234262925839e-17, 1, 0],
                [-1, 6.123234262925839e-17, 1],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 150,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2055'],
        },
      ],
    },
    {
      expected: `<Flex
  bg="#FFF"
  h="199px"
  overflow="hidden"
  pb="22px"
  pl="56px"
  pr="105px"
  pt="27px"
>
  <Box bg="conic-gradient(from 0deg at 50% 100%, #8ADAFF 0%, #DDEAFF 100%)" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2056',
          name: 'Frame 1597884478',
          type: 'FRAME',
          visible: true,
          parent: '10:14',
          children: ['10:6'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 311,
          height: 199,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 56,
            paddingRight: 105,
            paddingTop: 27,
            paddingBottom: 22,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:6',
          name: 'Conic 2',
          type: 'FRAME',
          visible: true,
          parent: '496:2056',
          children: [],
          fills: [
            {
              type: 'GRADIENT_ANGULAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.8653846383094788,
                    g: 0.9192305207252502,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [1.2016550432044563e-15, -0.5, 1],
                [0.5, 1.2681746581347047e-15, 0.25],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 150,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2056'],
        },
      ],
    },
    {
      expected: `<Flex
  bg="#FFF"
  h="239px"
  overflow="hidden"
  pb="31px"
  pl="108px"
  pr="74px"
  pt="58px"
>
  <Box bg="linear-gradient(to bottom right, #8ADAFF 0%, #DDEAFF 50%) bottom right / 50.1% 50.1% no-repeat, linear-gradient(to bottom left, #8ADAFF 0%, #DDEAFF 50%) bottom left / 50.1% 50.1% no-repeat, linear-gradient(to top left, #8ADAFF 0%, #DDEAFF 50%) top left / 50.1% 50.1% no-repeat, linear-gradient(to top right, #8ADAFF 0%, #DDEAFF 50%) top right / 50.1% 50.1% no-repeat" borderRadius="1000px" boxSize="150px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '496:2057',
          name: 'Frame 1597884479',
          type: 'FRAME',
          visible: true,
          parent: '10:14',
          children: ['10:10'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 332,
          height: 239,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 108,
            paddingRight: 74,
            paddingTop: 58,
            paddingBottom: 31,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MAX',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:10',
          name: 'Diamond',
          type: 'FRAME',
          visible: true,
          parent: '496:2057',
          children: [],
          fills: [
            {
              type: 'GRADIENT_DIAMOND',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5416664481163025,
                    g: 0.8548610210418701,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.8653846383094788,
                    g: 0.9192305207252502,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [7.288291606517838e-15, -1, 1],
                [1, 1.6481708965692841e-15, -5.329070518200751e-15],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 150,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '10:14',
          name: 'Gradient',
          type: 'SECTION',
          children: ['496:2057'],
        },
      ],
    },
    // text
    {
      expected: `<Text
  color="#FFF"
  fontFamily="Inter"
  fontSize="12px"
  fontWeight="400"
  letterSpacing="0em"
  lineHeight="normal"
>
  Hello World
</Text>`,
      nodes: [
        {
          id: '35:7',
          name: 'Hello World',
          type: 'TEXT',
          parent: '35:2',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          textAutoResize: 'WIDTH_AND_HEIGHT',
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          characters: 'Hello World',
          isAsset: false,
          textTruncation: 'DISABLED',
          effects: [],
          rotation: 0,
          reactions: [],
          visible: true,
          width: 65,
          height: 15,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
        },
        {
          id: '35:2',
          name: 'Text',
          type: 'SECTION',
          children: ['35:7'],
        },
      ],
    },
    {
      expected: `<Text
  color="#FFF"
  fontFamily="Inter"
  fontSize="12px"
  fontWeight="400"
  letterSpacing="0em"
  lineHeight="normal"
  w="100px"
>
  Hello World
</Text>`,
      nodes: [
        {
          id: '35:12',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '35:2',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
        },
        {
          id: '35:2',
          name: 'Text',
          type: 'SECTION',
          children: ['35:12'],
        },
      ],
    },
    {
      expected: `<Text
  boxSize="200px"
  color="#FFF"
  fontFamily="Inter"
  fontSize="12px"
  fontWeight="400"
  letterSpacing="0em"
  lineHeight="normal"
>
  Hello World
</Text>`,
      nodes: [
        {
          id: '35:18',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '35:2',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 200,
          height: 200,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'NONE',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
        },
        {
          id: '35:2',
          name: 'Text',
          type: 'SECTION',
          children: ['35:18'],
        },
      ],
    },
    {
      expected: `<Text
  color="#FFF"
  fontFamily="Inter"
  fontSize="12px"
  fontWeight="400"
  letterSpacing="0em"
  lineHeight="normal"
  textAlign="right"
  w="100px"
>
  Hello World
</Text>`,
      nodes: [
        {
          id: '41:7',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '35:2',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'RIGHT',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
        },
        {
          id: '35:2',
          name: 'Text',
          type: 'SECTION',
          children: ['41:7'],
        },
      ],
    },
    {
      expected: `<Text
  alignContent="center"
  boxSize="200px"
  color="#FFF"
  fontFamily="Inter"
  fontSize="12px"
  fontWeight="400"
  letterSpacing="0em"
  lineHeight="normal"
  textAlign="center"
>
  Hello World
</Text>`,
      nodes: [
        {
          id: '41:12',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '35:2',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 200,
          height: 200,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'NONE',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
        },
        {
          id: '35:2',
          name: 'Text',
          type: 'SECTION',
          children: ['41:12'],
        },
      ],
    },
    // auto layout
    {
      expected: `<Flex alignItems="center" bg="#50F" gap="10px" p="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="1.6"
  >
    Hello World
  </Text>
  <Box bg="#FFF" borderRadius="1000px" boxSize="12px" overflow="hidden" />
</Flex>`,
      nodes: [
        {
          id: '70:51',
          name: 'auto-layout-horizon',
          type: 'FRAME',
          reactions: [],
          parent: '70:49',
          children: ['70:50', '70:61'],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.3333333432674408,
                g: 0,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          width: 129,
          height: 46,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
        },
        {
          id: '70:50',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '70:51',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 87,
          height: 26,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
        },
        {
          id: '70:61',
          name: 'Frame 13',
          type: 'FRAME',
          visible: true,
          parent: '70:51',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 12,
          height: 12,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
        },
        {
          id: '70:49',
          name: 'Auto-layout & box',
          type: 'SECTION',
          children: ['70:51'],
        },
      ],
    },
    {
      expected: `<VStack alignItems="center" bg="#50F" gap="10px" p="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="1.6"
  >
    Hello World
  </Text>
  <Box bg="#FFF" borderRadius="1000px" boxSize="12px" overflow="hidden" />
</VStack>`,
      nodes: [
        {
          id: '70:57',
          name: 'auto-layout-vertical',
          type: 'FRAME',
          visible: true,
          parent: '70:49',
          children: ['70:58', '70:62'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.3333333432674408,
                g: 0,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 107,
          height: 68,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '70:58',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '70:57',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 87,
          height: 26,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
        },
        {
          id: '70:62',
          name: 'Frame 13',
          type: 'FRAME',
          visible: true,
          parent: '70:57',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 12,
          height: 12,
          rotation: 0,
          cornerRadius: 1000,
          topLeftRadius: 1000,
          topRightRadius: 1000,
          bottomLeftRadius: 1000,
          bottomRightRadius: 1000,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
        },
        {
          id: '70:49',
          name: 'Auto-layout & box',
          type: 'SECTION',
          children: ['70:57'],
        },
      ],
    },
    {
      expected: `<VStack alignItems="center" bg="#50F" gap="6px" p="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="1.6"
  >
    Hello World
  </Text>
  <Box bg="#FFF" h="1px" overflow="hidden" w="100%" />
</VStack>`,
      nodes: [
        {
          id: '71:124',
          name: 'auto-layout-vertical',
          type: 'FRAME',
          visible: true,
          parent: '70:49',
          children: ['71:125', '71:126'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.3333333432674408,
                g: 0,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 107,
          height: 53,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 6,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 6,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '71:125',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '71:124',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 87,
          height: 26,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
        },
        {
          id: '71:126',
          name: 'Frame 13',
          type: 'FRAME',
          visible: true,
          parent: '71:124',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 87,
          height: 1,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
        },
        {
          id: '70:49',
          name: 'Auto-layout & box',
          type: 'SECTION',
          children: ['71:124'],
        },
      ],
    },
    // Component
    {
      expected: `<Flex
  alignItems="center"
  bg="$primary"
  borderRadius="100px"
  gap="20px"
  px="60px"
  py="12px"
>
  <Text
    color="#FFF"
    fontFamily="Pretendard"
    fontSize="18px"
    fontWeight="700"
    letterSpacing="-0.04em"
    lineHeight="1.6"
  >
    더 자세히 알아보기
  </Text>
  <Box
    bg="#FFF"
    boxSize="20px"
    maskImage="url(/icons/arrow.svg)"
    maskRepeat="no-repeat"
    maskSize="contain"
  />
</Flex>`,
      nodes: [
        {
          id: '1:5',
          name: 'Button',
          type: 'FRAME',
          reactions: [],
          parent: '71:123',
          children: ['1:6', '2:11'],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 60,
            paddingRight: 60,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          cornerRadius: 100,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.35686275362968445,
                g: 0.20392157137393951,
                b: 0.9686274528503418,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:0b96ad7095bac52695a42f130ba1e6823e711569/3589:313]',
              },
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          width: 287,
          height: 53,
          topLeftRadius: 100,
          topRightRadius: 100,
          bottomLeftRadius: 100,
          bottomRightRadius: 100,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingLeft: 60,
          paddingRight: 60,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 20,
          counterAxisSpacing: 0,
        },
        {
          id: '1:6',
          name: '더 자세히 알아보기',
          type: 'TEXT',
          visible: true,
          parent: '1:5',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 127,
          height: 29,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          characters: '더 자세히 알아보기',
          fontName: {
            family: 'Pretendard',
            style: 'Bold',
          },
          fontSize: 18,
          fontWeight: 700,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
        },
        {
          id: '2:11',
          name: 'arrow',
          type: 'FRAME',
          visible: true,
          parent: '1:5',
          children: ['1:7'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 20,
          height: 20,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: true,
          reactions: [],
        },
        {
          id: '1:7',
          name: 'Stroke',
          type: 'VECTOR',
          visible: true,
          parent: '2:11',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 20,
          height: 20,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          targetAspectRatio: {
            x: 24,
            y: 24,
          },
        },
        {
          id: '71:123',
          name: 'Component 1',
          type: 'SECTION',
          children: ['1:5'],
        },
      ],
      variables: [
        {
          id: 'VariableID:0b96ad7095bac52695a42f130ba1e6823e711569/3589:313',
          name: 'primary',
        },
        {
          id: 'VariableID:15f2b5c6b66588df2b6463e5084ce0334621dcd6/3584:11',
          name: 'background',
        },
        {
          id: 'VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41',
          name: 'text',
        },
      ],
    },
    {
      expected: `<VStack bg="$background" borderRadius="30px" gap="20px" p="40px">
  <Image boxSize="64px" src="/icons/puzzle-piece.svg" />
  <Text
    color="$text"
    fontFamily="Pretendard"
    fontSize="20px"
    fontWeight="800"
    letterSpacing="-0.04em"
    lineHeight="1.4"
  >
    <Text color="$primary">
      자사 솔루션과의 연계
    </Text>
    를 통해<Box as="br" display={['none', null, 'initial']} />서비스 확장성과 성장 가능성을 높입니다.
  </Text>
  <Text
    color="$text"
    fontFamily="Pretendard"
    fontSize="16px"
    fontWeight="500"
    letterSpacing="-0.06em"
    lineHeight="1.6"
  >
    웹앱팩토리와 Presskit 등 자체 운영 중인 <Box as="br" display={['none', null, 'initial']} />솔루션과의 연계를 통해 프로젝트의 서비스 범위 확장, <Box as="br" display={['none', null, 'initial']} />운영 효율화, 성장 기회까지 제안드립니다.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '1:13',
          name: 'Card',
          type: 'FRAME',
          reactions: [],
          parent: '71:123',
          children: ['1:14', '1:17', '1:18'],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 40,
            paddingBottom: 40,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'STRETCH',
            layoutGrow: 1,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          cornerRadius: 30,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.9697822332382202,
                g: 0.9732044339179993,
                b: 0.9855769276618958,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:15f2b5c6b66588df2b6463e5084ce0334621dcd6/3584:11]',
              },
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          layoutMode: 'VERTICAL',
          width: 420,
          height: 318,
          topLeftRadius: 30,
          topRightRadius: 30,
          bottomLeftRadius: 30,
          bottomRightRadius: 30,
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
          itemSpacing: 20,
          counterAxisSpacing: 0,
        },
        {
          id: '1:14',
          name: 'puzzle-piece',
          type: 'FRAME',
          visible: true,
          parent: '1:13',
          children: ['1:15', '1:16'],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 64,
          height: 64,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: true,
          reactions: [],
        },
        {
          id: '1:15',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '1:14',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.6901960968971252,
                g: 0.6901960968971252,
                b: 0.686274528503418,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 57.96072006225586,
          height: 53.89710235595703,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
        },
        {
          id: '1:16',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '1:14',
          fills: [
            {
              type: 'GRADIENT_RADIAL',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.7176470756530762,
                    g: 0.8196078538894653,
                    b: 0.0941176488995552,
                    a: 1,
                  },
                  position: 0.5080000162124634,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.6980392336845398,
                    g: 0.8156862854957581,
                    b: 0.09803921729326248,
                    a: 1,
                  },
                  position: 0.5720000267028809,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.6470588445663452,
                    g: 0.8039215803146362,
                    b: 0.11372549086809158,
                    a: 1,
                  },
                  position: 0.6430000066757202,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.5607843399047852,
                    g: 0.7882353067398071,
                    b: 0.13333334028720856,
                    a: 1,
                  },
                  position: 0.7170000076293945,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.43921568989753723,
                    g: 0.7607843279838562,
                    b: 0.16470588743686676,
                    a: 1,
                  },
                  position: 0.7929999828338623,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.2823529541492462,
                    g: 0.729411780834198,
                    b: 0.20392157137393951,
                    a: 1,
                  },
                  position: 0.8709999918937683,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.0941176488995552,
                    g: 0.6901960968971252,
                    b: 0.250980406999588,
                    a: 1,
                  },
                  position: 0.9490000009536743,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.007843137718737125,
                    g: 0.6705882549285889,
                    b: 0.27450981736183167,
                    a: 1,
                  },
                  position: 0.9810000061988831,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [0.4799879491329193, 0, 0.26639416813850403],
                [0, 0.48956596851348877, 0.6352904438972473],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 57.2265625,
          height: 58.36850357055664,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
        },
        {
          id: '1:17',
          name: '자사 솔루션과의 연계를 통해 서비스 확장성과 성장 가능성을 높입니다.',
          type: 'TEXT',
          visible: true,
          parent: '1:13',
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 340,
          height: 56,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters:
            '자사 솔루션과의 연계를 통해\n서비스 확장성과 성장 가능성을 높입니다.',
          fontName: {
            family: 'Pretendard',
            style: 'ExtraBold',
          },
          fontSize: 20,
          fontWeight: 800,
          lineHeight: {
            unit: 'PERCENT',
            value: 139.9999976158142,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '자사 솔루션과의 연계',
              start: 0,
              end: 11,
              fontSize: 20,
              fontName: {
                family: 'Pretendard',
                style: 'ExtraBold',
              },
              fontWeight: 800,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 139.9999976158142,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.35686275362968445,
                    g: 0.20392157137393951,
                    b: 0.9686274528503418,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:0b96ad7095bac52695a42f130ba1e6823e711569/3589:313]',
                  },
                },
              ],
              textStyleId: 'S:42aa610b2125d507c89cd19b737e1c07835c76cd,4987:43',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
            {
              characters: '를 통해\n서비스 확장성과 성장 가능성을 높입니다.',
              start: 11,
              end: 38,
              fontSize: 20,
              fontName: {
                family: 'Pretendard',
                style: 'ExtraBold',
              },
              fontWeight: 800,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 139.9999976158142,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.10196078568696976,
                    g: 0.10196078568696976,
                    b: 0.10196078568696976,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41]',
                  },
                },
              ],
              textStyleId: 'S:42aa610b2125d507c89cd19b737e1c07835c76cd,4987:43',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '1:18',
          name: '웹앱팩토리와 Presskit 등 자체 운영 중인 솔루션과의 연계를 통해 프로젝트의 서비스 범위 확장, 운영 효율화, 성장 기회까지 제안드립니다.',
          type: 'TEXT',
          visible: true,
          parent: '1:13',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.10196078568696976,
                g: 0.10196078568696976,
                b: 0.10196078568696976,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 340,
          height: 78,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters:
            '웹앱팩토리와 Presskit 등 자체 운영 중인 \n솔루션과의 연계를 통해 프로젝트의 서비스 범위 확장, \n운영 효율화, 성장 기회까지 제안드립니다.',
          fontName: {
            family: 'Pretendard',
            style: 'Medium',
          },
          fontSize: 16,
          fontWeight: 500,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -6,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                '웹앱팩토리와 Presskit 등 자체 운영 중인 \n솔루션과의 연계를 통해 프로젝트의 서비스 범위 확장, \n운영 효율화, 성장 기회까지 제안드립니다.',
              start: 0,
              end: 82,
              fontSize: 16,
              fontName: {
                family: 'Pretendard',
                style: 'Medium',
              },
              fontWeight: 500,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -6,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.10196078568696976,
                    g: 0.10196078568696976,
                    b: 0.10196078568696976,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41]',
                  },
                },
              ],
              textStyleId: 'S:f416ab13d47ad55393b3cf3c7e2a45e33c6eec40,4987:46',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '71:123',
          name: 'Component 1',
          type: 'SECTION',
          children: ['1:13'],
        },
      ],
      variables: [
        {
          id: 'VariableID:15f2b5c6b66588df2b6463e5084ce0334621dcd6/3584:11',
          name: 'background',
        },
        {
          id: 'VariableID:0b96ad7095bac52695a42f130ba1e6823e711569/3589:313',
          name: 'primary',
        },
        {
          id: 'VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41',
          name: 'text',
        },
      ],
    },
    {
      expected: `<Flex alignItems="center" gap="20px" h="280px">
  <Center
    bg="#FFF"
    borderRadius="30px"
    flex="1"
    flexDir="column"
    h="100%"
    p="40px"
  >
    <Text
      color="#1A1A1A"
      fontFamily="Pretendard"
      fontSize="36px"
      fontWeight="500"
      letterSpacing="-0.06em"
      lineHeight="1.6"
    >
      CARD 1
    </Text>
  </Center>
  <Center
    bg="#FFF"
    borderRadius="30px"
    flex="1"
    flexDir="column"
    h="100%"
    p="40px"
  >
    <Text
      color="#1A1A1A"
      fontFamily="Pretendard"
      fontSize="36px"
      fontWeight="500"
      letterSpacing="-0.06em"
      lineHeight="1.6"
    >
      CARD 2
    </Text>
  </Center>
  <Center
    bg="#FFF"
    borderRadius="30px"
    flex="1"
    flexDir="column"
    h="100%"
    p="40px"
  >
    <Text
      color="#1A1A1A"
      fontFamily="Pretendard"
      fontSize="36px"
      fontWeight="500"
      letterSpacing="-0.06em"
      lineHeight="1.6"
    >
      CARD 3
    </Text>
  </Center>
</Flex>`,

      nodes: [
        {
          id: '43:20',
          name: 'CardContainer',
          type: 'FRAME',
          visible: true,
          parent: '71:123',
          children: ['43:2', '43:21', '43:23'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1200,
          height: 280,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 20,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '43:2',
          name: 'Card',
          type: 'FRAME',
          visible: true,
          parent: '43:20',
          children: ['43:7'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 386.6666564941406,
          height: 280,
          rotation: 0,
          cornerRadius: 30,
          topLeftRadius: 30,
          topRightRadius: 30,
          bottomLeftRadius: 30,
          bottomRightRadius: 30,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
          itemSpacing: 20,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 40,
            paddingBottom: 40,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 1,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '43:7',
          name: 'CARD 1',
          type: 'TEXT',
          visible: true,
          parent: '43:2',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.10196078568696976,
                g: 0.10196078568696976,
                b: 0.10196078568696976,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 111,
          height: 58,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters: 'CARD 1',
          fontName: {
            family: 'Pretendard',
            style: 'Medium',
          },
          fontSize: 36,
          fontWeight: 500,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -6,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'CARD 1',
              start: 0,
              end: 6,
              fontSize: 36,
              fontName: {
                family: 'Pretendard',
                style: 'Medium',
              },
              fontWeight: 500,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -6,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.10196078568696976,
                    g: 0.10196078568696976,
                    b: 0.10196078568696976,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '43:21',
          name: 'Card',
          type: 'FRAME',
          visible: true,
          parent: '43:20',
          children: ['43:22'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 386.66668701171875,
          height: 280,
          rotation: 0,
          cornerRadius: 30,
          topLeftRadius: 30,
          topRightRadius: 30,
          bottomLeftRadius: 30,
          bottomRightRadius: 30,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
          itemSpacing: 20,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 40,
            paddingBottom: 40,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 1,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '43:22',
          name: 'CARD 2',
          type: 'TEXT',
          visible: true,
          parent: '43:21',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.10196078568696976,
                g: 0.10196078568696976,
                b: 0.10196078568696976,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 116,
          height: 58,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters: 'CARD 2',
          fontName: {
            family: 'Pretendard',
            style: 'Medium',
          },
          fontSize: 36,
          fontWeight: 500,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -6,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'CARD 2',
              start: 0,
              end: 6,
              fontSize: 36,
              fontName: {
                family: 'Pretendard',
                style: 'Medium',
              },
              fontWeight: 500,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -6,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.10196078568696976,
                    g: 0.10196078568696976,
                    b: 0.10196078568696976,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '43:23',
          name: 'Card',
          type: 'FRAME',
          visible: true,
          parent: '43:20',
          children: ['43:24'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 386.66668701171875,
          height: 280,
          rotation: 0,
          cornerRadius: 30,
          topLeftRadius: 30,
          topRightRadius: 30,
          bottomLeftRadius: 30,
          bottomRightRadius: 30,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 40,
          paddingBottom: 40,
          itemSpacing: 20,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 40,
            paddingBottom: 40,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 1,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '43:24',
          name: 'CARD 3',
          type: 'TEXT',
          visible: true,
          parent: '43:23',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.10196078568696976,
                g: 0.10196078568696976,
                b: 0.10196078568696976,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 117,
          height: 58,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters: 'CARD 3',
          fontName: {
            family: 'Pretendard',
            style: 'Medium',
          },
          fontSize: 36,
          fontWeight: 500,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -6,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'CARD 3',
              start: 0,
              end: 6,
              fontSize: 36,
              fontName: {
                family: 'Pretendard',
                style: 'Medium',
              },
              fontWeight: 500,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -6,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.10196078568696976,
                    g: 0.10196078568696976,
                    b: 0.10196078568696976,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '71:123',
          name: 'Component 1',
          type: 'SECTION',
          children: ['43:20'],
        },
      ],
      variables: [
        {
          id: 'VariableID:15f2b5c6b66588df2b6463e5084ce0334621dcd6/3584:11',
          name: 'background',
        },
        {
          id: 'VariableID:0b96ad7095bac52695a42f130ba1e6823e711569/3589:313',
          name: 'primary',
        },
        {
          id: 'VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41',
          name: 'text',
        },
      ],
    },
    {
      expected: `<VStack
  alignItems="flex-end"
  backdropFilter="blur(4px)"
  bg="#FFFFFF0F"
  gap="10px"
  justifyContent="center"
  px="20px"
  py="10px"
>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="24px"
    fontStyle="italic"
    fontWeight="600"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet,{" "}
    <Text fontWeight="900">
      consectetur
    </Text>
    {" "}adipiscing elit.
  </Text>
</VStack>`,

      nodes: [
        {
          id: '40:51',
          name: 'font variable',
          type: 'FRAME',
          visible: true,
          parent: '71:123',
          children: ['40:52', '40:53'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 0.05999999865889549,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [
            {
              type: 'BACKGROUND_BLUR',
              visible: true,
              radius: 4,
              boundVariables: {},
              blurType: 'NORMAL',
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 400,
          height: 74,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MAX',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MAX',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '40:52',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:51',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 134,
          height: 29,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Semi Bold Italic',
          },
          fontSize: 24,
          fontWeight: 600,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'RIGHT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 24,
              fontName: {
                family: 'Inter',
                style: 'Semi Bold Italic',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:53',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:51',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 320,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontSize: 12,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'RIGHT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Lorem ipsum dolor sit amet, ',
              start: 0,
              end: 28,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
            {
              characters: 'consectetur',
              start: 28,
              end: 39,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Black',
              },
              fontWeight: 900,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
            {
              characters: ' adipiscing elit.',
              start: 39,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '71:123',
          name: 'Component 1',
          type: 'SECTION',
          children: ['40:51'],
        },
      ],
      variables: [
        {
          id: 'VariableID:15f2b5c6b66588df2b6463e5084ce0334621dcd6/3584:11',
          name: 'background',
        },
        {
          id: 'VariableID:0b96ad7095bac52695a42f130ba1e6823e711569/3589:313',
          name: 'primary',
        },
        {
          id: 'VariableID:a8911963a3ddc27e66ce960494a4683d9c4b1cab/1851:41',
          name: 'text',
        },
      ],
    },
    // outline, border
    {
      expected: `<Box bg="#FFF" border="solid 3px #FF1C1C" h="240px" overflow="hidden" />`,
      nodes: [
        {
          id: '105:11',
          name: 'inside',
          type: 'FRAME',
          reactions: [],
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 240,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'INSIDE',
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 240,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['105:11'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  h="240px"
  outline="solid 3px #FF1C1C"
  outlineOffset="-1.5px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:64',
          name: 'center',
          type: 'FRAME',
          reactions: [],
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 240,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'CENTER',
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 240,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['105:64'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box bg="#FFF" h="240px" outline="solid 3px #FF1C1C" overflow="hidden" />`,
      nodes: [
        {
          id: '105:12',
          name: 'outside',
          type: 'FRAME',
          visible: true,
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'OUTSIDE',
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['105:12'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  border="solid 3px #FF1C1C"
  borderRadius="20px"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:75',
          name: 'inside',
          type: 'FRAME',
          visible: true,
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'INSIDE',
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['105:75'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  h="240px"
  outline="solid 3px #FF1C1C"
  outlineOffset="-1.5px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:77',
          name: 'center',
          type: 'FRAME',
          visible: true,
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'CENTER',
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['105:77'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  h="240px"
  outline="solid 3px #FF1C1C"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:90',
          name: 'outside',
          type: 'FRAME',
          reactions: [],
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 240,
          cornerRadius: 20,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'OUTSIDE',
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 240,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['105:90'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  border="solid 3px #FF1C1C"
  borderRadius="20px"
  boxShadow="0 4px 4px 0 #00000040"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '113:67',
          name: 'inside + BoxShadow',
          type: 'FRAME',
          visible: true,
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          effects: [
            {
              type: 'DROP_SHADOW',
              visible: true,
              radius: 4,
              boundVariables: {},
              color: {
                r: 0,
                g: 0,
                b: 0,
                a: 0.25,
              },
              offset: {
                x: 0,
                y: 4,
              },
              spread: 0,
              blendMode: 'NORMAL',
              showShadowBehindNode: false,
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'INSIDE',
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['113:67'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  boxShadow="0 4px 4px 0 #00000040"
  h="240px"
  outline="solid 3px #FF1C1C"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '113:71',
          name: 'outside + BoxShadow',
          type: 'FRAME',
          visible: true,
          parent: '105:14',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.11057692021131516,
                b: 0.11057692021131516,
              },
              boundVariables: {},
            },
          ],
          effects: [
            {
              type: 'DROP_SHADOW',
              visible: true,
              radius: 4,
              boundVariables: {},
              color: {
                r: 0,
                g: 0,
                b: 0,
                a: 0.25,
              },
              offset: {
                x: 0,
                y: 4,
              },
              spread: 0,
              blendMode: 'NORMAL',
              showShadowBehindNode: false,
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          dashPattern: [],
          strokeWeight: 3,
          strokeAlign: 'OUTSIDE',
        },
        {
          id: '105:14',
          name: 'outline, border',
          type: 'SECTION',
          children: ['113:71'],
        },
      ],
      variables: [],
    },
    // circle
    {
      expected: `<Box bg="#D9D9D9" borderRadius="50%" boxSize="100px" />`,
      nodes: [
        {
          id: '109:69',
          name: 'Ellipse 3620',
          type: 'ELLIPSE',
          reactions: [],
          parent: '109:83',
          arcData: {
            startingAngle: 0,
            endingAngle: 6.2831854820251465,
            innerRadius: 0,
          },
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          isAsset: true,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          width: 100,
          height: 100,
          cornerRadius: 0,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
        },
        {
          id: '109:83',
          name: 'Circle',
          type: 'SECTION',
          children: ['109:69'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box bg="#D9D9D9" borderRadius="50%" h="100px" w="50px" />`,
      nodes: [
        {
          id: '109:72',
          name: 'Ellipse 3622',
          type: 'ELLIPSE',
          visible: true,
          parent: '109:83',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 50,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          arcData: {
            startingAngle: 0,
            endingAngle: 6.2831854820251465,
            innerRadius: 0,
          },
        },
        {
          id: '109:83',
          name: 'Circle',
          type: 'SECTION',
          children: ['109:72'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#D9D9D9"
  boxSize="100px"
  maskImage="url(/icons/ellipse3621.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
      nodes: [
        {
          id: '109:71',
          name: 'ellipse3621',
          type: 'ELLIPSE',
          visible: true,
          parent: '109:83',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          arcData: {
            startingAngle: 0,
            endingAngle: 5.6181230545043945,
            innerRadius: 0.4148121774196625,
          },
        },
        {
          id: '109:83',
          name: 'Circle',
          type: 'SECTION',
          children: ['109:71'],
        },
      ],
      variables: [],
    },
    // border
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  h="240px"
  outline="solid 1px #000"
  outlineOffset="-0.5px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '80:2',
          name: 'border',
          type: 'FRAME',
          reactions: [],
          parent: '35:3',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 240,
          cornerRadius: 20,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeWeight: 1,
          strokeAlign: 'CENTER',
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 240,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          itemSpacing: 0,
          counterAxisSpacing: 0,
        },
        {
          id: '35:3',
          name: 'Border',
          type: 'SECTION',
          children: ['80:2'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  h="240px"
  outline="dashed 1px #000"
  outlineOffset="-0.5px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '80:6',
          name: 'border',
          type: 'FRAME',
          visible: true,
          parent: '35:3',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          dashPattern: [2, 2],
          strokeWeight: 1,
          strokeAlign: 'CENTER',
        },
        {
          id: '35:3',
          name: 'Border',
          type: 'SECTION',
          children: ['80:6'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderTop="solid 1px #000"
  maskImage="url(/icons/border.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
      nodes: [
        {
          id: '80:40',
          name: 'border',
          type: 'FRAME',
          reactions: [],
          parent: '35:3',
          children: ['80:38', '80:39'],
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeBottomWeight: 0,
          strokeTopWeight: 1,
          strokeLeftWeight: 0,
          strokeRightWeight: 0,
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          width: 260,
          height: 140,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          strokeAlign: 'OUTSIDE',
        },
        {
          id: '80:38',
          name: 'border',
          type: 'FRAME',
          visible: true,
          parent: '80:40',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 80,
          height: 140,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeTopWeight: 0,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'CENTER',
          dashPattern: [],
        },
        {
          id: '80:39',
          name: 'border',
          type: 'FRAME',
          visible: true,
          parent: '80:40',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 180,
          height: 140,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeTopWeight: 0,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'CENTER',
          dashPattern: [],
        },
        {
          id: '35:3',
          name: 'Border',
          type: 'SECTION',
          children: ['80:40'],
        },
      ],
      variables: [],
    },
    // opacity
    {
      expected: `<Box
  bg="#FFF"
  border="solid 1px #000"
  borderRadius="20px"
  h="240px"
  opacity="0.2"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '89:3',
          name: 'opacity',
          type: 'FRAME',
          reactions: [],
          parent: '89:2',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 240,
          cornerRadius: 20,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          opacity: 0.20000000298023224,
          blendMode: 'PASS_THROUGH',
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 240,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          itemSpacing: 0,
          counterAxisSpacing: 0,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
        },
        {
          id: '89:2',
          name: 'Opacity',
          type: 'SECTION',
          children: ['89:3'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF3"
  border="solid 1px #0003"
  borderRadius="20px"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:91',
          name: 'opacity',
          type: 'FRAME',
          visible: true,
          parent: '89:2',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 0.20000000298023224,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 0.20000000298023224,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '89:2',
          name: 'Opacity',
          type: 'SECTION',
          children: ['105:91'],
        },
      ],
      variables: [],
    },
    // clamp
    {
      expected: `<Flex alignItems="center" bg="#FFF" p="10px">
  <Text
    color="#000"
    flex="1"
    fontFamily="Inter"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="1.6"
    overflow="hidden"
    textOverflow="ellipsis"
    whiteSpace="nowrap"
  >
    Getting into life {"'"}Cause I found that it{"'"}s not so boring Not anymore.
  </Text>
</Flex>`,
      nodes: [
        {
          id: '70:72',
          name: 'clamp - fill',
          type: 'FRAME',
          reactions: [],
          parent: '60:26',
          children: ['70:73'],
          paddingLeft: 10,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          layoutMode: 'HORIZONTAL',
          width: 600,
          height: 46,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '70:73',
          name: "Getting into life 'Cause I found that it's not so boring Not anymore.",
          type: 'TEXT',
          visible: true,
          parent: '70:72',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 580,
          height: 26,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            "Getting into life 'Cause I found that it's not so boring Not anymore.",
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'ENDING',
          maxLines: 1,
          styledTextSegments: [
            {
              characters:
                "Getting into life 'Cause I found that it's not so boring Not anymore.",
              start: 0,
              end: 69,
              fontSize: 16,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:26',
          name: 'clamp',
          type: 'SECTION',
          children: ['70:72'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Flex alignItems="center" bg="#FFF" p="10px">
  <Text
    color="#000"
    fontFamily="Inter"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="1.6"
    whiteSpace="nowrap"
  >
    Getting into life {"'"}Cause I found that it{"'"}s not so boring Not anymore.
  </Text>
</Flex>`,
      nodes: [
        {
          id: '70:79',
          name: 'clamp - hug',
          type: 'FRAME',
          visible: true,
          parent: '60:26',
          children: ['70:80'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 600,
          height: 46,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '70:80',
          name: "Getting into life 'Cause I found that it's not so boring Not anymore.",
          type: 'TEXT',
          visible: true,
          parent: '70:79',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 500,
          height: 26,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            "Getting into life 'Cause I found that it's not so boring Not anymore.",
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'ENDING',
          maxLines: 1,
          styledTextSegments: [
            {
              characters:
                "Getting into life 'Cause I found that it's not so boring Not anymore.",
              start: 0,
              end: 69,
              fontSize: 16,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:26',
          name: 'clamp',
          type: 'SECTION',
          children: ['70:79'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Flex alignItems="center" bg="#FFF" p="10px">
  <Text
    WebkitBoxOrient="vertical"
    WebkitLineClamp="2"
    color="#000"
    display="-webkit-box"
    flex="1"
    fontFamily="Inter"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="1.6"
    overflow="hidden"
    textOverflow="ellipsis"
  >
    Getting into life {"'"}Cause I found that it{"'"}s not so boring Not anymore.
  </Text>
</Flex>`,
      nodes: [
        {
          id: '70:92',
          name: 'clamp - fill',
          type: 'FRAME',
          visible: true,
          parent: '60:26',
          children: ['70:93'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 600,
          height: 46,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '70:93',
          name: "Getting into life 'Cause I found that it's not so boring Not anymore.",
          type: 'TEXT',
          visible: true,
          parent: '70:92',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 580,
          height: 26,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            "Getting into life 'Cause I found that it's not so boring Not anymore.",
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'ENDING',
          maxLines: 2,
          styledTextSegments: [
            {
              characters:
                "Getting into life 'Cause I found that it's not so boring Not anymore.",
              start: 0,
              end: 69,
              fontSize: 16,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:26',
          name: 'clamp',
          type: 'SECTION',
          children: ['70:92'],
        },
      ],
      variables: [],
    },
    // effect
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  boxShadow="0 4px 4px 0 #00000040"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:95',
          name: 'boxShadow',
          type: 'FRAME',
          reactions: [],
          parent: '105:13',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          isAsset: false,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 240,
          cornerRadius: 20,
          strokes: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          paddingTop: 0,
          paddingRight: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          effects: [
            {
              type: 'DROP_SHADOW',
              visible: true,
              radius: 4,
              boundVariables: {},
              color: {
                r: 0,
                g: 0,
                b: 0,
                a: 0.25,
              },
              offset: {
                x: 0,
                y: 4,
              },
              spread: 0,
              blendMode: 'NORMAL',
              showShadowBehindNode: false,
            },
          ],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 240,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          itemSpacing: 0,
          counterAxisSpacing: 0,
          strokeWeight: 3,
          strokeTopWeight: 3,
          strokeBottomWeight: 3,
          strokeLeftWeight: 3,
          strokeRightWeight: 3,
          strokeAlign: 'CENTER',
          dashPattern: [],
        },
        {
          id: '105:13',
          name: 'effect',
          type: 'SECTION',
          children: ['105:95'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  boxShadow="inset 0 4px 4px 0 #00000040"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:99',
          name: 'inset',
          type: 'FRAME',
          visible: true,
          parent: '105:13',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [
            {
              type: 'INNER_SHADOW',
              visible: true,
              radius: 4,
              boundVariables: {},
              color: {
                r: 0,
                g: 0,
                b: 0,
                a: 0.25,
              },
              offset: {
                x: 0,
                y: 4,
              },
              spread: 0,
              blendMode: 'NORMAL',
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 3,
          strokeTopWeight: 3,
          strokeBottomWeight: 3,
          strokeLeftWeight: 3,
          strokeRightWeight: 3,
          strokeAlign: 'CENTER',
          dashPattern: [],
        },
        {
          id: '105:13',
          name: 'effect',
          type: 'SECTION',
          children: ['105:99'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#FFF"
  borderRadius="20px"
  filter="blur(4px)"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:103',
          name: 'blur',
          type: 'FRAME',
          visible: true,
          parent: '105:13',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [
            {
              type: 'LAYER_BLUR',
              visible: true,
              radius: 4,
              boundVariables: {},
              blurType: 'NORMAL',
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 3,
          strokeTopWeight: 3,
          strokeBottomWeight: 3,
          strokeLeftWeight: 3,
          strokeRightWeight: 3,
          strokeAlign: 'CENTER',
          dashPattern: [],
        },
        {
          id: '105:13',
          name: 'effect',
          type: 'SECTION',
          children: ['105:103'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  backdropFilter="blur(10px)"
  bg="#FFF3"
  borderRadius="20px"
  h="240px"
  overflow="hidden"
/>`,
      nodes: [
        {
          id: '105:107',
          name: 'backgroundBlur',
          type: 'FRAME',
          visible: true,
          parent: '105:13',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 0.20000000298023224,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [
            {
              type: 'BACKGROUND_BLUR',
              visible: true,
              radius: 10,
              boundVariables: {},
              blurType: 'NORMAL',
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 240,
          height: 240,
          rotation: 0,
          cornerRadius: 20,
          topLeftRadius: 20,
          topRightRadius: 20,
          bottomLeftRadius: 20,
          bottomRightRadius: 20,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 3,
          strokeTopWeight: 3,
          strokeBottomWeight: 3,
          strokeLeftWeight: 3,
          strokeRightWeight: 3,
          strokeAlign: 'CENTER',
          dashPattern: [],
        },
        {
          id: '105:13',
          name: 'effect',
          type: 'SECTION',
          children: ['105:107'],
        },
      ],
      variables: [],
    },
    // Dimmend, absolute
    {
      expected: `<VStack
  bg="linear-gradient(90deg, $primaryBgLight 0%, $secondaryBg 100%)"
  gap="20px"
  justifyContent="center"
  overflow="hidden"
  px="20px"
  py="50px"
>
  <Image
    filter="blur(12px)"
    h="100%"
    pos="absolute"
    right="-108.01px"
    src="/images/puzzle.png"
    top="-76px"
    transform="rotate(8.83deg)"
    transformOrigin="top left"
    w="300px"
  />
  <Box
    bg="linear-gradient(0deg, #EDEEFF 0%, #EDEEFF00 100%)"
    boxSize="100%"
    left="0px"
    pos="absolute"
    top="0px"
  />
  <VStack gap="8px" justifyContent="center">
    <Text
      color="$primary"
      fontFamily="Pretendard"
      fontSize="12px"
      fontWeight="600"
      letterSpacing="-0.04em"
      lineHeight="1.6"
    >
      지금 시작할 수 있어요
    </Text>
    <Text
      color="$title"
      fontFamily="Pretendard"
      fontSize="20px"
      fontWeight="700"
      letterSpacing="-0.04em"
      lineHeight="1.2"
    >
      내 삶을 더 잘 이해하는 첫 걸음
    </Text>
  </VStack>
  <Text
    color="$text"
    fontFamily="Pretendard"
    fontSize="14px"
    fontWeight="400"
    letterSpacing="-0.04em"
    lineHeight="1.6"
  >
    자꾸 미뤄졌던 나에 대한 고민, <Box as="br" display={['none', null, 'initial']} />퍼즐핏에서 구체적인 답을 찾아보세요.
  </Text>
  <VStack gap="12px" justifyContent="center">
    <GradientButton />
    <Text
      color="$textLight"
      fontFamily="Pretendard"
      fontSize="12px"
      fontWeight="400"
      letterSpacing="-0.04em"
      lineHeight="1.6"
      opacity="0.5"
    >
      회원가입 후, 유료로 진행됩니다
    </Text>
  </VStack>
</VStack>`,

      nodes: [
        {
          id: '107:26',
          name: 'Container',
          type: 'FRAME',
          reactions: [],
          parent: '109:84',
          children: ['107:27', '107:28', '107:29', '107:32', '107:33'],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 50,
            paddingBottom: 50,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 1,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.9803921580314636,
                    g: 0.9607843160629272,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:5ed5fe4e2c110aae522cfe81f189c59552683358/18:227]',
                  },
                },
                {
                  color: {
                    r: 0.8784313797950745,
                    g: 0.9058823585510254,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:417859516cc38076cb4af248fcd12020cd9ae4b2/27:25]',
                  },
                },
              ],
              gradientTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
            },
          ],
          width: 360,
          height: 311,
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 50,
          paddingBottom: 50,
          itemSpacing: 20,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '107:27',
          name: 'puzzle',
          type: 'RECTANGLE',
          visible: true,
          parent: '107:26',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'e7958a16573afffb69800c3c66b7a5abdbd7bce3',
            },
          ],
          strokes: [],
          effects: [
            {
              type: 'LAYER_BLUR',
              visible: true,
              radius: 12,
              boundVariables: {},
              blurType: 'PROGRESSIVE',
              startRadius: 0,
              startOffset: {
                x: 0.5,
                y: 0.3321799337863922,
              },
              endOffset: {
                x: 0.14488635957241058,
                y: 0.8797577619552612,
              },
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 300,
          height: 332,
          rotation: -8.82894874863189,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'ABSOLUTE',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          constraints: {
            horizontal: 'MAX',
            vertical: 'MIN',
          },
          x: 168.009765625,
          y: -76,
        },
        {
          id: '107:28',
          name: 'dimmed',
          type: 'RECTANGLE',
          visible: true,
          parent: '107:26',
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.929411768913269,
                    g: 0.9333333373069763,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.929411768913269,
                    g: 0.9333333373069763,
                    b: 1,
                    a: 0,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [-1.8426270287363877e-8, -1, 1],
                [1, -3.776177948111581e-8, -1.5905754935374716e-8],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 360,
          height: 311,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'ABSOLUTE',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          constraints: {
            horizontal: 'MIN',
            vertical: 'MIN',
          },
          x: 0,
          y: 0,
        },
        {
          id: '107:29',
          name: 'Frame 105',
          type: 'FRAME',
          visible: true,
          parent: '107:26',
          children: ['107:30', '107:31'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 222,
          height: 51,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 8,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 8,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '107:30',
          name: '지금 시작할 수 있어요',
          type: 'TEXT',
          visible: true,
          parent: '107:29',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.529411792755127,
                g: 0.12156862765550613,
                b: 0.9019607901573181,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:51a40441a4e76d70d58452cb534b842a89c22c63/14:47]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 97,
          height: 19,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '지금 시작할 수 있어요',
          fontName: {
            family: 'Pretendard',
            style: 'SemiBold',
          },
          fontSize: 12,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '지금 시작할 수 있어요',
              start: 0,
              end: 12,
              fontSize: 12,
              fontName: {
                family: 'Pretendard',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.529411792755127,
                    g: 0.12156862765550613,
                    b: 0.9019607901573181,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:51a40441a4e76d70d58452cb534b842a89c22c63/14:47]',
                  },
                },
              ],
              textStyleId: 'S:5ab6109ba578c1e241c1ec0231069c37ffab9ebe,27:18',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '107:31',
          name: '내 삶을 더 잘 이해하는 첫 걸음',
          type: 'TEXT',
          visible: true,
          parent: '107:29',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.06666667014360428,
                g: 0.0941176488995552,
                b: 0.15294118225574493,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:099a1a094b0ad8776e9d00872465534eee0f1c2a/14:64]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 222,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '내 삶을 더 잘 이해하는 첫 걸음',
          fontName: {
            family: 'Pretendard',
            style: 'Bold',
          },
          fontSize: 20,
          fontWeight: 700,
          lineHeight: {
            unit: 'PERCENT',
            value: 120.00000476837158,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '내 삶을 더 잘 이해하는 첫 걸음',
              start: 0,
              end: 18,
              fontSize: 20,
              fontName: {
                family: 'Pretendard',
                style: 'Bold',
              },
              fontWeight: 700,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 120.00000476837158,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.06666667014360428,
                    g: 0.0941176488995552,
                    b: 0.15294118225574493,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:099a1a094b0ad8776e9d00872465534eee0f1c2a/14:64]',
                  },
                },
              ],
              textStyleId: 'S:22826d8fa5409d17932c82e7bda0b9c7306d99ca,34:65',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '107:32',
          name: '자꾸 미뤄졌던 나에 대한 고민, 퍼즐핏에서 구체적인 답을 찾아보세요.',
          type: 'TEXT',
          visible: true,
          parent: '107:26',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.21568627655506134,
                g: 0.2549019753932953,
                b: 0.3176470696926117,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:1500634352fc7d420979f2b85b3736d4b0a410de/14:65]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 320,
          height: 44,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            '자꾸 미뤄졌던 나에 대한 고민, \n퍼즐핏에서 구체적인 답을 찾아보세요.',
          fontName: {
            family: 'Pretendard',
            style: 'Regular',
          },
          fontSize: 14,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                '자꾸 미뤄졌던 나에 대한 고민, \n퍼즐핏에서 구체적인 답을 찾아보세요.',
              start: 0,
              end: 39,
              fontSize: 14,
              fontName: {
                family: 'Pretendard',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.21568627655506134,
                    g: 0.2549019753932953,
                    b: 0.3176470696926117,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:1500634352fc7d420979f2b85b3736d4b0a410de/14:65]',
                  },
                },
              ],
              textStyleId: 'S:7d3ad4ba2c8903ffba997502193ac0827747a798,18:212',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '107:33',
          name: 'Frame 106',
          type: 'FRAME',
          visible: true,
          parent: '107:26',
          children: ['107:34', '107:35'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 140,
          height: 76,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 12,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 12,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '107:34',
          name: 'GradientButton',
          type: 'INSTANCE',
          visible: true,
          parent: '107:33',
          children: ['I107:34;18:2206'],
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.5764706134796143,
                    g: 0.20000000298023224,
                    b: 0.9176470637321472,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.30980393290519714,
                    g: 0.27450981736183167,
                    b: 0.8980392217636108,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
            },
          ],
          strokes: [],
          effects: [
            {
              type: 'DROP_SHADOW',
              visible: true,
              radius: 4,
              boundVariables: {},
              color: {
                r: 0,
                g: 0,
                b: 0,
                a: 0.10000000149011612,
              },
              offset: {
                x: 0,
                y: 2,
              },
              spread: -2,
              blendMode: 'NORMAL',
              showShadowBehindNode: false,
            },
            {
              type: 'DROP_SHADOW',
              visible: true,
              radius: 6,
              boundVariables: {},
              color: {
                r: 0,
                g: 0,
                b: 0,
                a: 0.10000000149011612,
              },
              offset: {
                x: 0,
                y: 4,
              },
              spread: -1,
              blendMode: 'NORMAL',
              showShadowBehindNode: false,
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 138,
          height: 45,
          rotation: 0,
          cornerRadius: 8,
          topLeftRadius: 8,
          topRightRadius: 8,
          bottomLeftRadius: 8,
          bottomRightRadius: 8,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: 'I107:34;18:2206',
          name: 'Text',
          type: 'TEXT',
          visible: true,
          parent: '107:34',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 78,
          height: 21,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '검사 시작하기',
          fontName: {
            family: 'Pretendard',
            style: 'SemiBold',
          },
          fontSize: 15,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 139.9999976158142,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '검사 시작하기',
              start: 0,
              end: 7,
              fontSize: 15,
              fontName: {
                family: 'Pretendard',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 139.9999976158142,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: 'S:dc4ad9d035b632bb81cb467ad64f4bb9448ded87,18:206',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '107:35',
          name: '회원가입 후, 유료로 진행됩니다',
          type: 'TEXT',
          visible: true,
          parent: '107:33',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.29411765933036804,
                g: 0.3333333432674408,
                b: 0.38823530077934265,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:93d8aadc9ec1c35e7c24bdf723b9b05a01b75a2d/14:70]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 0.5,
          blendMode: 'PASS_THROUGH',
          width: 140,
          height: 19,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '회원가입 후, 유료로 진행됩니다',
          fontName: {
            family: 'Pretendard',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 160.0000023841858,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -4,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'CENTER',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '회원가입 후, 유료로 진행됩니다',
              start: 0,
              end: 17,
              fontSize: 12,
              fontName: {
                family: 'Pretendard',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 160.0000023841858,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -4,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.29411765933036804,
                    g: 0.3333333432674408,
                    b: 0.38823530077934265,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:93d8aadc9ec1c35e7c24bdf723b9b05a01b75a2d/14:70]',
                  },
                },
              ],
              textStyleId: 'S:6104b34398c9cfd4de9323f16187c4cc20509420,27:15',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '109:84',
          name: 'Dimmed와 absolute',
          type: 'SECTION',
          children: ['107:26'],
        },
      ],
      variables: [
        {
          id: 'VariableID:5ed5fe4e2c110aae522cfe81f189c59552683358/18:227',
          name: 'primaryBgLight',
        },
        {
          id: 'VariableID:417859516cc38076cb4af248fcd12020cd9ae4b2/27:25',
          name: 'secondaryBg',
        },
        {
          id: 'VariableID:51a40441a4e76d70d58452cb534b842a89c22c63/14:47',
          name: 'primary',
        },
        {
          id: 'VariableID:099a1a094b0ad8776e9d00872465534eee0f1c2a/14:64',
          name: 'title',
        },
        {
          id: 'VariableID:1500634352fc7d420979f2b85b3736d4b0a410de/14:65',
          name: 'text',
        },
        {
          id: 'VariableID:93d8aadc9ec1c35e7c24bdf723b9b05a01b75a2d/14:70',
          name: 'textLight',
        },
      ],
    },
    // svg
    {
      expected: `<Box
  aspectRatio="1"
  bg="$caption"
  h="20px"
  maskImage="url(/icons/recommend.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
  pb="2.96px"
  pl="3.49px"
  pr="2.89px"
  pt="2.02px"
/>`,
      nodes: [
        {
          id: '171:1545',
          name: 'recommend',
          type: 'FRAME',
          visible: true,
          parent: '189:1752',
          children: ['171:1546'],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 20,
          height: 20,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          targetAspectRatio: {
            x: 280,
            y: 280,
          },
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 3.4942855834960938,
            paddingRight: 2.894681930541992,
            paddingTop: 2.021327495574951,
            paddingBottom: 2.962193012237549,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1546',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1545',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '189:1752',
          name: 'SVG',
          type: 'SECTION',
          children: ['171:1545'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<Box
  bg="$caption"
  maskImage="url(/icons/recommend.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
  px="3px"
  py="2px"
/>`,
      nodes: [
        {
          id: '171:1553',
          name: 'recommend',
          type: 'FRAME',
          visible: true,
          parent: '189:1752',
          children: ['171:1559', '171:1554'],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 19.611032485961914,
          height: 34.032958984375,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 3,
          paddingRight: 3,
          paddingTop: 2,
          paddingBottom: 2,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 3,
            paddingRight: 3,
            paddingTop: 2,
            paddingBottom: 2,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1559',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1553',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1554',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1553',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '189:1752',
          name: 'SVG',
          type: 'SECTION',
          children: ['171:1553'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<Box
  bg="$caption"
  maskImage="url(/icons/recommend.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
  px="3px"
  py="2px"
/>`,
      nodes: [
        {
          id: '171:1561',
          name: 'recommend',
          type: 'FRAME',
          visible: true,
          parent: '189:1752',
          children: ['171:1565', '171:1563'],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 19.611032485961914,
          height: 34.032958984375,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 3,
          paddingRight: 3,
          paddingTop: 2,
          paddingBottom: 2,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 3,
            paddingRight: 3,
            paddingTop: 2,
            paddingBottom: 2,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1565',
          name: 'Group 2',
          type: 'GROUP',
          visible: true,
          parent: '171:1561',
          children: ['171:1562'],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '171:1562',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1565',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: -180,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1563',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1561',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '189:1752',
          name: 'SVG',
          type: 'SECTION',
          children: ['171:1561'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<Image px="3px" py="2px" src="/icons/recommend.svg" />`,
      nodes: [
        {
          id: '171:1566',
          name: 'recommend',
          type: 'FRAME',
          visible: true,
          parent: '189:1752',
          children: ['171:1567', '171:1569'],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 19.611032485961914,
          height: 34.032958984375,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 3,
          paddingRight: 3,
          paddingTop: 2,
          paddingBottom: 2,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 3,
            paddingRight: 3,
            paddingTop: 2,
            paddingBottom: 2,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1567',
          name: 'Group 2',
          type: 'GROUP',
          visible: true,
          parent: '171:1566',
          children: ['171:1568'],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
        },
        {
          id: '171:1568',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1567',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4054486155509949,
                g: 0.2079222947359085,
                b: 0.2079222947359085,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: -180,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1569',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1566',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '189:1752',
          name: 'SVG',
          type: 'SECTION',
          children: ['171:1566'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<Image src="/icons/recommend.svg" />`,
      nodes: [
        {
          id: '171:1548',
          name: 'recommend',
          type: 'FRAME',
          reactions: [],
          parent: '189:1752',
          children: ['188:1549', '171:1549'],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 3,
            layoutPositioning: 'AUTO',
          },
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          width: 20,
          height: 33.032958984375,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 3,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '188:1549',
          name: 'Frame 1597884470',
          type: 'FRAME',
          visible: true,
          parent: '171:1548',
          children: ['171:1551'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1551',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1549',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '171:1549',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '171:1548',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.7676283121109009,
                g: 0.1328587383031845,
                b: 0.1328587383031845,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '189:1752',
          name: 'SVG',
          type: 'SECTION',
          children: ['171:1548'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    // flex with maxW
    {
      expected: `<VStack
  alignItems="center"
  bg="#FFF"
  overflow="hidden"
  px="30px"
  py="80px"
>
  <Center flexDir="column" gap="50px" maxW="1280px" w="100%">
    <Text
      color="#000"
      fontFamily="Inter"
      fontSize="40px"
      fontWeight="400"
      letterSpacing="0em"
      lineHeight="normal"
    >
      Hello World!
    </Text>
    <Image h="500px" src="/images/image.png" w="100%" />
  </Center>
</VStack>`,
      nodes: [
        {
          id: '60:2',
          name: 'Container',
          type: 'FRAME',
          reactions: [],
          parent: '35:5',
          children: ['60:5'],
          paddingLeft: 30,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 80,
            paddingBottom: 80,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: true,
          visible: true,
          layoutMode: 'VERTICAL',
          width: 1920,
          height: 758,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingRight: 30,
          paddingTop: 80,
          paddingBottom: 80,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:5',
          name: 'Frame 12',
          type: 'FRAME',
          visible: true,
          parent: '60:2',
          children: ['60:4', '60:7'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 598,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 50,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: 1280,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 50,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:4',
          name: 'Hello World!',
          type: 'TEXT',
          visible: true,
          parent: '60:5',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 228,
          height: 48,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World!',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 40,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World!',
              start: 0,
              end: 12,
              fontSize: 40,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:7',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '60:5',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 500,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '35:5',
          name: 'Flex with maxW',
          type: 'SECTION',
          children: ['60:2'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<VStack
  alignItems="center"
  bg="#FFF"
  overflow="hidden"
  px="30px"
  py="80px"
>
  <Center flexDir="column" gap="50px" maxW="1280px" w="100%">
    <Text
      color="#000"
      fontFamily="Inter"
      fontSize="40px"
      fontWeight="400"
      letterSpacing="0em"
      lineHeight="normal"
    >
      Hello World!
    </Text>
    <Image aspectRatio="1.77" h="720px" src="/images/image.png" w="100%" />
  </Center>
</VStack>`,
      nodes: [
        {
          id: '60:19',
          name: 'imageRatio',
          type: 'FRAME',
          visible: true,
          parent: '35:5',
          children: ['60:20'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1920,
          height: 978,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 80,
          paddingBottom: 80,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 80,
            paddingBottom: 80,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:20',
          name: 'Frame 12',
          type: 'FRAME',
          visible: true,
          parent: '60:19',
          children: ['60:21', '60:22'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 818,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 50,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: 1280,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 50,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:21',
          name: 'Hello World!',
          type: 'TEXT',
          visible: true,
          parent: '60:20',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 228,
          height: 48,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World!',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 40,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World!',
              start: 0,
              end: 12,
              fontSize: 40,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:22',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '60:20',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 720,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          targetAspectRatio: {
            x: 1280,
            y: 720,
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '35:5',
          name: 'Flex with maxW',
          type: 'SECTION',
          children: ['60:19'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<VStack
  alignItems="center"
  bg="#FFF"
  overflow="hidden"
  px="30px"
  py="80px"
>
  <Center
    flexDir="column"
    gap="50px"
    h="600px"
    maxW="1280px"
    w="100%"
  >
    <Text
      color="#000"
      fontFamily="Inter"
      fontSize="40px"
      fontWeight="400"
      letterSpacing="0em"
      lineHeight="normal"
    >
      Hello World!
    </Text>
    <Image boxSize="100%" maxH="400px" maxW="800px" src="/images/image.png" />
  </Center>
</VStack>`,
      nodes: [
        {
          id: '60:27',
          name: 'maxW maxH',
          type: 'FRAME',
          visible: true,
          parent: '35:5',
          children: ['60:28'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1920,
          height: 760,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 80,
          paddingBottom: 80,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 80,
            paddingBottom: 80,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:28',
          name: 'Frame 12',
          type: 'FRAME',
          visible: true,
          parent: '60:27',
          children: ['60:29', '60:30'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 600,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 50,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: 1280,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 50,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:29',
          name: 'Hello World!',
          type: 'TEXT',
          visible: true,
          parent: '60:28',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 228,
          height: 48,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World!',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 40,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World!',
              start: 0,
              end: 12,
              fontSize: 40,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:30',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '60:28',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 800,
          height: 400,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: 800,
          minHeight: null,
          maxHeight: 400,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '35:5',
          name: 'Flex with maxW',
          type: 'SECTION',
          children: ['60:27'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<VStack
  alignItems="center"
  bg="#FFF"
  overflow="hidden"
  px="30px"
  py="80px"
>
  <Center flexDir="column" gap="50px" maxW="1280px" w="100%">
    <Text
      color="#000"
      fontFamily="Inter"
      fontSize="40px"
      fontWeight="400"
      letterSpacing="0em"
      lineHeight="normal"
    >
      Hello World!
    </Text>
    <Image h="400px" maxW="800px" src="/images/image.png" w="100%" />
  </Center>
</VStack>`,
      nodes: [
        {
          id: '60:31',
          name: 'maxW',
          type: 'FRAME',
          visible: true,
          parent: '35:5',
          children: ['60:32'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1920,
          height: 658,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 80,
          paddingBottom: 80,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 80,
            paddingBottom: 80,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:32',
          name: 'Frame 12',
          type: 'FRAME',
          visible: true,
          parent: '60:31',
          children: ['60:33', '60:34'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 498,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 50,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: 1280,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 50,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:33',
          name: 'Hello World!',
          type: 'TEXT',
          visible: true,
          parent: '60:32',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 228,
          height: 48,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World!',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 40,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World!',
              start: 0,
              end: 12,
              fontSize: 40,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:34',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '60:32',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 800,
          height: 400,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: 800,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '35:5',
          name: 'Flex with maxW',
          type: 'SECTION',
          children: ['60:31'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    {
      expected: `<VStack
  alignItems="center"
  bg="#FFF"
  h="760px"
  overflow="hidden"
  px="30px"
  py="80px"
>
  <Center flexDir="column" gap="50px" maxW="1280px" w="100%">
    <Text
      color="#000"
      fontFamily="Inter"
      fontSize="40px"
      fontWeight="400"
      letterSpacing="0em"
      lineHeight="normal"
    >
      Hello World!
    </Text>
    <Image boxSize="100%" maxH="400px" maxW="1024px" src="/images/image.png" />
  </Center>
</VStack>`,
      nodes: [
        {
          id: '60:35',
          name: 'maxH',
          type: 'FRAME',
          visible: true,
          parent: '35:5',
          children: ['60:36'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1920,
          height: 760,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 30,
          paddingRight: 30,
          paddingTop: 80,
          paddingBottom: 80,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 30,
            paddingRight: 30,
            paddingTop: 80,
            paddingBottom: 80,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:36',
          name: 'Frame 12',
          type: 'FRAME',
          visible: true,
          parent: '60:35',
          children: ['60:37', '60:38'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 600,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 50,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: 1280,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 1,
            itemSpacing: 50,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '60:37',
          name: 'Hello World!',
          type: 'TEXT',
          visible: true,
          parent: '60:36',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 228,
          height: 48,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World!',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 40,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World!',
              start: 0,
              end: 12,
              fontSize: 40,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0,
                    g: 0,
                    b: 0,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '60:38',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '60:36',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1024,
          height: 400,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FILL',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: 1024,
          minHeight: null,
          maxHeight: 400,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '35:5',
          name: 'Flex with maxW',
          type: 'SECTION',
          children: ['60:35'],
        },
      ],
      variables: [
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
      ],
    },
    // Text with auto layout
    {
      expected: `<VStack gap="10px" justifyContent="center" px="20px" py="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '40:3',
          name: 'Frame 2',
          type: 'FRAME',
          reactions: [],
          parent: '36:24',
          children: ['40:2', '40:4'],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          width: 400,
          height: 60,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:2',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:3',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:4',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:3',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:3'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Flex alignItems="center" gap="10px" px="20px" py="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</Flex>`,
      nodes: [
        {
          id: '40:57',
          name: 'Frame 10',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:58', '40:59'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 429,
          height: 35,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:58',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:57',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:59',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:57',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:57'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack
  gap="10px"
  h="200px"
  justifyContent="center"
  px="20px"
  py="10px"
>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '40:9',
          name: 'Frame 3',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:10', '40:11'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 400,
          height: 200,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:10',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:9',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:11',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:9',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:9'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Flex alignItems="center" gap="10px" px="20px" py="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    flex="1"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</Flex>`,
      nodes: [
        {
          id: '40:78',
          name: 'Frame 11',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:79', '40:80'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 600,
          height: 35,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:79',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:78',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:80',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:78',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 485,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:78'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Center flexDir="column" gap="10px" px="20px" py="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</Center>`,
      nodes: [
        {
          id: '40:18',
          name: 'Frame 4',
          type: 'FRAME',
          reactions: [],
          parent: '36:24',
          children: ['40:19', '40:20'],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          width: 400,
          height: 60,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:19',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:18',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:20',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:18',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:18'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack
  alignItems="center"
  gap="10px"
  h="200px"
  justifyContent="flex-end"
  px="20px"
  py="10px"
>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '40:30',
          name: 'Frame 6',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:31', '40:32'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 400,
          height: 200,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MAX',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MAX',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:31',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:30',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:32',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:30',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:30'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack gap="10px" justifyContent="center" px="20px" py="10px">
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
    textAlign="center"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
    textAlign="center"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '40:42',
          name: 'Frame 8',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:43', '40:44'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 400,
          height: 60,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:43',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:42',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 360,
          height: 15,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:44',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:42',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 360,
          height: 15,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:42'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack
  alignItems="flex-end"
  gap="10px"
  justifyContent="flex-end"
  px="20px"
  py="10px"
>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '40:24',
          name: 'Frame 5',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:25', '40:26'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 400,
          height: 60,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MAX',
          counterAxisAlignItems: 'MAX',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MAX',
            counterAxisAlignItems: 'MAX',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:25',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:24',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:26',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:24',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:24'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack
  alignItems="flex-end"
  gap="10px"
  h="200px"
  justifyContent="center"
  px="20px"
  py="10px"
>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Hello World
  </Text>
  <Text
    color="#FFF"
    fontFamily="Inter"
    fontSize="12px"
    fontWeight="400"
    letterSpacing="0em"
    lineHeight="normal"
  >
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
  </Text>
</VStack>`,
      nodes: [
        {
          id: '40:36',
          name: 'Frame 7',
          type: 'FRAME',
          visible: true,
          parent: '36:24',
          children: ['40:37', '40:38'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 400,
          height: 200,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'MAX',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MAX',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '40:37',
          name: 'Hello World',
          type: 'TEXT',
          visible: true,
          parent: '40:36',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 65,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: 'Hello World',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: 'Hello World',
              start: 0,
              end: 11,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '40:38',
          name: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          type: 'TEXT',
          visible: true,
          parent: '40:36',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 314,
          height: 15,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
          fontName: {
            family: 'Inter',
            style: 'Regular',
          },
          fontSize: 12,
          fontWeight: 400,
          lineHeight: {
            unit: 'AUTO',
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              start: 0,
              end: 56,
              fontSize: 12,
              fontName: {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'AUTO',
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '36:24',
          name: 'Text with auto layout',
          type: 'SECTION',
          children: ['40:36'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack p="10px">
  <Image h="500px" src="/images/image.png" />
</VStack>`,
      nodes: [
        {
          id: '69:9',
          name: 'object-fit : cover (default)',
          type: 'FRAME',
          reactions: [],
          parent: '69:18',
          children: ['69:8'],
          paddingLeft: 10,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          layoutMode: 'VERTICAL',
          width: 1300,
          height: 520,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '69:8',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '69:9',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 0.5905511975288391, 0.20472441613674164],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 500,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '69:18',
          name: 'object-fit',
          type: 'SECTION',
          children: ['69:9'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack p="10px">
  <Image h="500px" objectFit="contain" src="/images/image.png" />
</VStack>`,
      nodes: [
        {
          id: '69:13',
          name: 'object-fit : contain',
          type: 'FRAME',
          visible: true,
          parent: '69:18',
          children: ['69:14'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1300,
          height: 520,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
          paddingBottom: 10,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '69:14',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '69:13',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FIT',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: 'b39b8e5c5acff7a565c2d9f6d0e923160b0271f3',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1280,
          height: 500,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '69:18',
          name: 'object-fit',
          type: 'SECTION',
          children: ['69:13'],
        },
      ],
      variables: [],
    },
    {
      expected: `<VStack
  bg="$innerBg"
  gap="16px"
  outline="solid 1px $border"
  outlineOffset="-0.5px"
  p="20px"
>
  <Flex alignItems="center" gap="8px">
    <Text
      color="$caption"
      fontFamily="SUIT"
      fontSize="16px"
      fontWeight="600"
      letterSpacing="-1px"
      lineHeight="1.5"
    >
      플레이 제목
    </Text>
    <Box
      aspectRatio="1"
      bg="$caption"
      borderRadius="50%"
      boxSize="6px"
      opacity="0.2"
    />
    <Text
      color="$caption"
      fontFamily="SUIT"
      fontSize="15px"
      fontWeight="400"
      letterSpacing="-0.5px"
      lineHeight="1.5"
    >
      2025.03.03 18:00
    </Text>
    <Box
      aspectRatio="1"
      bg="$caption"
      borderRadius="50%"
      boxSize="6px"
      opacity="0.2"
    />
    <Flex alignItems="center" gap="4px">
      <Box
        aspectRatio="1"
        bg="$caption"
        boxSize="20px"
        maskImage="url(/icons/recommend.svg)"
        maskRepeat="no-repeat"
        maskSize="contain"
      />
      <Text
        color="$caption"
        fontFamily="SUIT"
        fontSize="15px"
        fontWeight="600"
        letterSpacing="-0.5px"
        lineHeight="1.5"
      >
        2
      </Text>
    </Flex>
  </Flex>
  <Text
    color="$text"
    fontFamily="SUIT"
    fontSize="16px"
    fontWeight="400"
    letterSpacing="-1px"
    lineHeight="1.5"
  >
    댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력
  </Text>
</VStack>`,
      nodes: [
        {
          id: '109:51',
          name: 'Card',
          type: 'FRAME',
          reactions: [],
          parent: '187:1545',
          children: ['109:52', '109:64'],
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 20,
            paddingBottom: 20,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 1,
            itemSpacing: 16,
            layoutPositioning: 'AUTO',
          },
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8941176533699036,
                g: 0.9137254953384399,
                b: 0.9490196108818054,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:f5613063210cb55c4f22591497c139340720b4f9/2:116]',
              },
            },
          ],
          dashPattern: [],
          strokeWeight: 1,
          strokeAlign: 'CENTER',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:48af241d35e3be1aa75c9b68e40b32ee5f7c2d40/2:200]',
              },
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          layoutMode: 'VERTICAL',
          width: 1060,
          height: 104,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 20,
          paddingBottom: 20,
          itemSpacing: 16,
          counterAxisSpacing: 0,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
        },
        {
          id: '109:52',
          name: 'Frame 1597884450',
          type: 'FRAME',
          visible: true,
          parent: '109:51',
          children: ['109:53', '109:54', '109:55', '109:56', '109:57'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1020,
          height: 24,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 8,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 8,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '109:53',
          name: '플레이 제목',
          type: 'TEXT',
          visible: true,
          parent: '109:52',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 69,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '플레이 제목',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 16,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '플레이 제목',
              start: 0,
              end: 6,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.4941176474094391,
                    g: 0.4941176474094391,
                    b: 0.4941176474094391,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
                  },
                },
              ],
              textStyleId: 'S:ff39719a4f4432493ec910934cf96b8acdefc1ab,7:190',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '109:54',
          name: 'Ellipse 3618',
          type: 'ELLIPSE',
          visible: true,
          parent: '109:52',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 0.20000000298023224,
          blendMode: 'PASS_THROUGH',
          width: 6,
          height: 6,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          targetAspectRatio: {
            x: 6,
            y: 6,
          },
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          arcData: {
            startingAngle: 0,
            endingAngle: 6.2831854820251465,
            innerRadius: 0,
          },
        },
        {
          id: '109:55',
          name: '2025.03.03 18:00',
          type: 'TEXT',
          visible: true,
          parent: '109:52',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 112,
          height: 23,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '2025.03.03 18:00',
          fontName: {
            family: 'SUIT',
            style: 'Regular',
          },
          fontSize: 15,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -0.5,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '2025.03.03 18:00',
              start: 0,
              end: 16,
              fontSize: 15,
              fontName: {
                family: 'SUIT',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -0.5,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.4941176474094391,
                    g: 0.4941176474094391,
                    b: 0.4941176474094391,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
                  },
                },
              ],
              textStyleId: 'S:8de3e75e8aa9e74fc05518a1daedc751ba038ca3,2:423',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '109:56',
          name: 'Ellipse 3619',
          type: 'ELLIPSE',
          visible: true,
          parent: '109:52',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 0.20000000298023224,
          blendMode: 'PASS_THROUGH',
          width: 6,
          height: 6,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          targetAspectRatio: {
            x: 6,
            y: 6,
          },
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          arcData: {
            startingAngle: 0,
            endingAngle: 6.2831854820251465,
            innerRadius: 0,
          },
        },
        {
          id: '109:57',
          name: 'Frame 1597884461',
          type: 'FRAME',
          visible: true,
          parent: '109:52',
          children: ['109:58', '109:63'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 33,
          height: 23,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 4,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 4,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '109:58',
          name: 'recommend',
          type: 'FRAME',
          visible: true,
          parent: '109:57',
          children: ['109:62'],
          fills: [
            {
              type: 'SOLID',
              visible: false,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 20,
          height: 20,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          targetAspectRatio: {
            x: 280,
            y: 280,
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '109:62',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '109:58',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.611032485961914,
          height: 15.0164794921875,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
        },
        {
          id: '109:63',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '109:57',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4941176474094391,
                g: 0.4941176474094391,
                b: 0.4941176474094391,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 9,
          height: 23,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '2',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 15,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -0.5,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters: '2',
              start: 0,
              end: 1,
              fontSize: 15,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -0.5,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.4941176474094391,
                    g: 0.4941176474094391,
                    b: 0.4941176474094391,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146]',
                  },
                },
              ],
              textStyleId: 'S:f7a84b2aff07543a05b32108ab91010ac120d7c6,26:61',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '109:64',
          name: '댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력',
          type: 'TEXT',
          visible: true,
          parent: '109:51',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 1020,
          height: 24,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters:
            '댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력',
          fontName: {
            family: 'SUIT',
            style: 'Regular',
          },
          fontSize: 16,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          styledTextSegments: [
            {
              characters:
                '댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력 댓글 내용 출력',
              start: 0,
              end: 44,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:0daf4d1717522daf9c82204ed1d91b4ead4935b4,35:31',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '187:1545',
          name: 'Case 1 - MaskImage',
          type: 'SECTION',
          children: ['109:51'],
        },
      ],
      variables: [
        {
          id: 'VariableID:f5613063210cb55c4f22591497c139340720b4f9/2:116',
          name: 'border',
        },
        {
          id: 'VariableID:48af241d35e3be1aa75c9b68e40b32ee5f7c2d40/2:200',
          name: 'innerBg',
        },
        {
          id: 'VariableID:041286802cda2ac64dfa81669076d76d0b63e802/2:146',
          name: 'caption',
        },
        {
          id: 'VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137',
          name: 'text',
        },
      ],
    },
    // grid
    {
      expected: `<Grid gap="10px" gridTemplateColumns="repeat(2, 1fr)" gridTemplateRows="repeat(2, 1fr)" h="210px">
  <Box bg="#697F9F" h="100px" overflow="hidden" />
  <Box bg="#697F9F" h="100px" overflow="hidden" />
  <Box bg="#697F9F" h="100px" overflow="hidden" />
  <Box bg="#697F9F" h="100px" overflow="hidden" />
</Grid>`,

      nodes: [
        {
          id: '145:1912',
          name: 'Grid',
          type: 'FRAME',
          visible: true,
          parent: '145:1927',
          children: ['145:1909', '145:1910', '145:1928', '145:1929'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 210,
          height: 210,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'GRID',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'GRID',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 2,
          gridRowGap: 10,
          gridColumnGap: 10,
          gridRowCount: 2,
        },
        {
          id: '145:1909',
          name: 'Frame 1597884463',
          type: 'FRAME',
          visible: true,
          parent: '145:1912',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 0,
          gridRowAnchorIndex: 0,
          gridColumnCount: 0,
        },
        {
          id: '145:1910',
          name: 'Frame 1597884464',
          type: 'FRAME',
          visible: true,
          parent: '145:1912',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 1,
          gridRowAnchorIndex: 0,
          gridColumnCount: 0,
        },
        {
          id: '145:1928',
          name: 'Frame 1597884465',
          type: 'FRAME',
          visible: true,
          parent: '145:1912',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 0,
          gridRowAnchorIndex: 1,
          gridColumnCount: 0,
        },
        {
          id: '145:1929',
          name: 'Frame 1597884466',
          type: 'FRAME',
          visible: true,
          parent: '145:1912',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 1,
          gridRowAnchorIndex: 1,
          gridColumnCount: 0,
        },
        {
          id: '145:1927',
          name: 'Grid',
          type: 'SECTION',
          children: ['145:1912'],
        },
      ],
      variables: [
        {
          id: 'VariableID:a41981510611520a1c47fa7ab84eb8fc2ae29df4/38:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:7b0c74af99b6b0b15148212c8340b286b4f12630/38:82',
          name: 'text',
        },
        {
          id: 'VariableID:4be0713ea9f483833095fc5a0baa288fccc81e47/90:29',
          name: 'primary',
        },
        {
          id: 'VariableID:1060bad3592be247585df7163f204873508facae/90:51',
          name: 'primaryBold',
        },
      ],
    },
    {
      expected: `<Grid gap="10px" gridTemplateColumns="repeat(2, 1fr)" gridTemplateRows="repeat(4, 1fr)" h="430px">
  <Box
    bg="#697F9F"
    gridColumn="1 / span 1"
    gridRow="4 / span 1"
    h="100px"
    overflow="hidden"
  />
  <Box
    bg="#697F9F"
    gridColumn="2 / span 1"
    gridRow="3 / span 1"
    h="100px"
    overflow="hidden"
  />
</Grid>`,
      nodes: [
        {
          id: '169:1545',
          name: 'Grid - 순서대로 정렬 X',
          type: 'FRAME',
          inferredAutoLayout: {
            layoutMode: 'GRID',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          gridRowGap: 10,
          gridColumnGap: 10,
          gridColumnCount: 2,
          gridRowCount: 4,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          parent: '145:1927',
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 430,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          children: ['169:1553', '169:1566'],
          rotation: 0,
          clipsContent: false,
          reactions: [],
          visible: true,
          layoutMode: 'GRID',
          width: 210,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '169:1553',
          name: 'Frame 1597884468',
          type: 'FRAME',
          visible: true,
          parent: '169:1545',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 0,
          gridRowAnchorIndex: 3,
          gridColumnCount: 0,
        },
        {
          id: '169:1566',
          name: 'Frame 1597884469',
          type: 'FRAME',
          visible: true,
          parent: '169:1545',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 1,
          gridRowAnchorIndex: 2,
          gridColumnCount: 0,
        },
        {
          id: '145:1927',
          name: 'Grid',
          type: 'SECTION',
          children: ['169:1545'],
        },
      ],
      variables: [
        {
          id: 'VariableID:a41981510611520a1c47fa7ab84eb8fc2ae29df4/38:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:7b0c74af99b6b0b15148212c8340b286b4f12630/38:82',
          name: 'text',
        },
        {
          id: 'VariableID:4be0713ea9f483833095fc5a0baa288fccc81e47/90:29',
          name: 'primary',
        },
        {
          id: 'VariableID:1060bad3592be247585df7163f204873508facae/90:51',
          name: 'primaryBold',
        },
      ],
    },
    {
      expected: `<Grid gap="10px" gridTemplateColumns="repeat(2, 1fr)" gridTemplateRows="repeat(2, 1fr)" h="210px">
  <Box bg="#697F9F" h="100px" overflow="hidden" />
</Grid>`,
      nodes: [
        {
          id: '169:1563',
          name: 'Grid - child 가 1개밖에 없을 때',
          type: 'FRAME',
          visible: true,
          parent: '145:1927',
          children: ['169:1564'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 210,
          height: 210,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'GRID',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'GRID',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 2,
          gridRowGap: 10,
          gridColumnGap: 10,
          gridRowCount: 2,
        },
        {
          id: '169:1564',
          name: 'Frame 1597884468',
          type: 'FRAME',
          visible: true,
          parent: '169:1563',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 0,
          gridRowAnchorIndex: 0,
          gridColumnCount: 0,
        },
        {
          id: '145:1927',
          name: 'Grid',
          type: 'SECTION',
          children: ['169:1563'],
        },
      ],
      variables: [
        {
          id: 'VariableID:a41981510611520a1c47fa7ab84eb8fc2ae29df4/38:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:7b0c74af99b6b0b15148212c8340b286b4f12630/38:82',
          name: 'text',
        },
        {
          id: 'VariableID:4be0713ea9f483833095fc5a0baa288fccc81e47/90:29',
          name: 'primary',
        },
        {
          id: 'VariableID:1060bad3592be247585df7163f204873508facae/90:51',
          name: 'primaryBold',
        },
      ],
    },
    {
      expected: `<Grid gap="10px" gridTemplateColumns="repeat(2, 1fr)" gridTemplateRows="repeat(2, 1fr)" h="210px">
  <Box
    bg="#697F9F"
    gridColumn="2 / span 1"
    gridRow="2 / span 1"
    h="100px"
    overflow="hidden"
  />
</Grid>`,
      nodes: [
        {
          id: '179:1554',
          name: 'Grid - child 가 1개밖에 없을 때',
          type: 'FRAME',
          visible: true,
          parent: '145:1927',
          children: ['179:1555'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 210,
          height: 210,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'GRID',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'GRID',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 2,
          gridRowGap: 10,
          gridColumnGap: 10,
          gridRowCount: 2,
        },
        {
          id: '179:1555',
          name: 'Frame 1597884468',
          type: 'FRAME',
          visible: true,
          parent: '179:1554',
          children: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.4117647111415863,
                g: 0.49803921580314636,
                b: 0.6235294342041016,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: 1,
          gridRowAnchorIndex: 1,
          gridColumnCount: 0,
        },
        {
          id: '145:1927',
          name: 'Grid',
          type: 'SECTION',
          children: ['179:1554'],
        },
      ],
      variables: [
        {
          id: 'VariableID:a41981510611520a1c47fa7ab84eb8fc2ae29df4/38:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:7b0c74af99b6b0b15148212c8340b286b4f12630/38:82',
          name: 'text',
        },
        {
          id: 'VariableID:4be0713ea9f483833095fc5a0baa288fccc81e47/90:29',
          name: 'primary',
        },
        {
          id: 'VariableID:1060bad3592be247585df7163f204873508facae/90:51',
          name: 'primaryBold',
        },
      ],
    },
    // mix blend
    {
      expected: `<Image
  aspectRatio="1"
  boxSize="413px"
  mixBlendMode="overlay"
  opacity="0.8"
  src="/images/image.png"
/>`,
      nodes: [
        {
          id: '245:1595',
          name: 'image',
          type: 'RECTANGLE',
          reactions: [],
          parent: '245:1608',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: '5cee49483aa40d5cbf1764b2d584efc365723714',
            },
          ],
          isAsset: true,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          targetAspectRatio: {
            x: 4096,
            y: 4096,
          },
          width: 413,
          height: 413,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          opacity: 0.800000011920929,
          blendMode: 'OVERLAY',
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '245:1608',
          name: 'Mix Blend Mode',
          type: 'SECTION',
          children: ['245:1595'],
        },
      ],
      variables: [
        {
          id: 'VariableID:a41981510611520a1c47fa7ab84eb8fc2ae29df4/38:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:7b0c74af99b6b0b15148212c8340b286b4f12630/38:82',
          name: 'text',
        },
        {
          id: 'VariableID:4be0713ea9f483833095fc5a0baa288fccc81e47/90:29',
          name: 'primary',
        },
        {
          id: 'VariableID:1060bad3592be247585df7163f204873508facae/90:51',
          name: 'primaryBold',
        },
      ],
    },
    {
      expected: `<Image
  aspectRatio="1"
  boxSize="413px"
  mixBlendMode="screen"
  opacity="0.8"
  src="/images/image.png"
/>`,
      nodes: [
        {
          id: '245:1600',
          name: 'image',
          type: 'RECTANGLE',
          visible: true,
          parent: '245:1608',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: '5cee49483aa40d5cbf1764b2d584efc365723714',
            },
          ],
          strokes: [],
          effects: [],
          opacity: 0.800000011920929,
          blendMode: 'SCREEN',
          width: 413,
          height: 413,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          targetAspectRatio: {
            x: 4096,
            y: 4096,
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '245:1608',
          name: 'Mix Blend Mode',
          type: 'SECTION',
          children: ['245:1600'],
        },
      ],
      variables: [
        {
          id: 'VariableID:a41981510611520a1c47fa7ab84eb8fc2ae29df4/38:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:7b0c74af99b6b0b15148212c8340b286b4f12630/38:82',
          name: 'text',
        },
        {
          id: 'VariableID:4be0713ea9f483833095fc5a0baa288fccc81e47/90:29',
          name: 'primary',
        },
        {
          id: 'VariableID:1060bad3592be247585df7163f204873508facae/90:51',
          name: 'primaryBold',
        },
      ],
    },
    {
      expected: `<Image
  aspectRatio="1"
  boxSize="413px"
  mixBlendMode="multiply"
  opacity="0.8"
  src="/images/image.png"
/>`,
      nodes: [
        {
          id: '245:1607',
          name: 'image',
          type: 'RECTANGLE',
          reactions: [],
          parent: '245:1608',
          fills: [
            {
              type: 'IMAGE',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              scaleMode: 'FILL',
              imageTransform: [
                [1, 0, 0],
                [0, 1, 0],
              ],
              scalingFactor: 0.5,
              rotation: 0,
              filters: {
                exposure: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
                highlights: 0,
                shadows: 0,
              },
              imageHash: '5cee49483aa40d5cbf1764b2d584efc365723714',
            },
          ],
          isAsset: true,
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          targetAspectRatio: {
            x: 4096,
            y: 4096,
          },
          width: 413,
          height: 413,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          opacity: 0.800000011920929,
          blendMode: 'MULTIPLY',
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '245:1608',
          name: 'Mix Blend Mode',
          type: 'SECTION',
          children: ['245:1607'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box bg="#D9D9D9" boxSize="100px" mixBlendMode="soft-light" />`,
      nodes: [
        {
          id: '245:1609',
          name: 'Rectangle 39796',
          type: 'RECTANGLE',
          visible: true,
          parent: '245:1608',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'SOFT_LIGHT',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '245:1608',
          name: 'Mix Blend Mode',
          type: 'SECTION',
          children: ['245:1609'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Text
  color="#FF1919"
  fontFamily="Jalnan Gothic TTF"
  fontSize="64px"
  fontWeight="400"
  letterSpacing="-0.05em"
  lineHeight="1.4"
  mixBlendMode="darken"
>
  데브파이브
</Text>`,
      nodes: [
        {
          id: '245:1614',
          name: '데브파이브',
          type: 'TEXT',
          visible: true,
          parent: '245:1608',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0.09615384787321091,
                b: 0.09615384787321091,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'DARKEN',
          width: 308,
          height: 90,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '데브파이브',
          fontName: {
            family: 'Jalnan Gothic TTF',
            style: 'Regular',
          },
          fontSize: 64,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 139.9999976158142,
          },
          letterSpacing: {
            unit: 'PERCENT',
            value: -5,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '데브파이브',
              start: 0,
              end: 5,
              fontSize: 64,
              fontName: {
                family: 'Jalnan Gothic TTF',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 139.9999976158142,
              },
              letterSpacing: {
                unit: 'PERCENT',
                value: -5,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 0.09615384787321091,
                    b: 0.09615384787321091,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: '',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '245:1608',
          name: 'Mix Blend Mode',
          type: 'SECTION',
          children: ['245:1614'],
        },
      ],
      variables: [],
    },
    // testcase dron
    {
      expected: `<VStack
  alignItems="flex-end"
  bg="$primaryBg"
  border="solid 1px $border"
  gap="20px"
  px="40px"
  py="30px"
>
  <Text
    color="$text"
    fontFamily="SUIT"
    fontSize="20px"
    fontWeight="700"
    letterSpacing="-1px"
    lineHeight="1.5"
  >
    간편 로그인 연동
  </Text>
  <VStack>
    <Flex
      alignItems="center"
      borderRadius="10px"
      gap="12px"
      px="20px"
      py="12px"
    >
      <Text
        color="$text"
        flex="1"
        fontFamily="SUIT"
        fontSize="16px"
        fontWeight="600"
        letterSpacing="-1px"
        lineHeight="1.5"
      >
        카카오
      </Text>
      <Text
        color="$gray500"
        fontFamily="SUIT"
        fontSize="15px"
        fontWeight="400"
        letterSpacing="-0.5px"
        lineHeight="1.5"
      >
        연결 전
      </Text>
      <Center
        bg="$primary"
        border="solid 1px $primary"
        borderRadius="100px"
        px="12px"
        py="4px"
      >
        <Text
          color="#FFF"
          fontFamily="Pretendard"
          fontSize="14px"
          fontWeight="500"
          letterSpacing="0px"
          lineHeight="16px"
        >
          인증하기
        </Text>
      </Center>
    </Flex>
    <Flex
      alignItems="center"
      borderRadius="10px"
      gap="12px"
      px="20px"
      py="12px"
    >
      <Text
        color="$text"
        flex="1"
        fontFamily="SUIT"
        fontSize="16px"
        fontWeight="600"
        letterSpacing="-1px"
        lineHeight="1.5"
      >
        구글
      </Text>
      <Text
        color="$gray500"
        fontFamily="SUIT"
        fontSize="15px"
        fontWeight="400"
        letterSpacing="-0.5px"
        lineHeight="1.5"
      >
        cooolvita@gmail.com
      </Text>
      <Center
        bg="$primary"
        border="solid 1px $primary"
        borderRadius="100px"
        px="12px"
        py="4px"
      >
        <Text
          color="#FFF"
          fontFamily="Pretendard"
          fontSize="14px"
          fontWeight="500"
          letterSpacing="0px"
          lineHeight="16px"
        >
          인증하기
        </Text>
      </Center>
    </Flex>
  </VStack>
  <Box bg="$border" h="1px" />
  <VStack>
    <Flex
      alignItems="center"
      borderRadius="10px"
      gap="12px"
      px="20px"
      py="12px"
    >
      <Text
        color="$text"
        flex="1"
        fontFamily="SUIT"
        fontSize="16px"
        fontWeight="600"
        letterSpacing="-1px"
        lineHeight="1.5"
      >
        서비스 이용약관
      </Text>
      <Box
        bg="$gray300"
        boxSize="24px"
        maskImage="url(/icons/ic:round-arrow-left.svg)"
        maskRepeat="no-repeat"
        maskSize="contain"
        transform="rotate(180deg)"
      />
    </Flex>
    <Flex
      alignItems="center"
      borderRadius="10px"
      gap="12px"
      px="20px"
      py="12px"
    >
      <Text
        color="$text"
        flex="1"
        fontFamily="SUIT"
        fontSize="16px"
        fontWeight="600"
        letterSpacing="-1px"
        lineHeight="1.5"
      >
        개인정보 처리방침
      </Text>
      <Box
        bg="$gray300"
        boxSize="24px"
        maskImage="url(/icons/ic:round-arrow-left.svg)"
        maskRepeat="no-repeat"
        maskSize="contain"
        transform="rotate(180deg)"
      />
    </Flex>
    <Flex
      alignItems="center"
      borderRadius="10px"
      gap="12px"
      px="20px"
      py="12px"
    >
      <Text
        color="$text"
        flex="1"
        fontFamily="SUIT"
        fontSize="16px"
        fontWeight="600"
        letterSpacing="-1px"
        lineHeight="1.5"
      >
        회원 탈퇴
      </Text>
      <Box
        bg="$gray300"
        boxSize="24px"
        maskImage="url(/icons/ic:round-arrow-left.svg)"
        maskRepeat="no-repeat"
        maskSize="contain"
        transform="rotate(180deg)"
      />
    </Flex>
  </VStack>
</VStack>`,
      nodes: [
        {
          id: '113:9',
          name: 'Section1',
          type: 'FRAME',
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: 30,
            paddingBottom: 30,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MAX',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 20,
            layoutPositioning: 'AUTO',
          },
          reactions: [],
          parent: '189:1785',
          children: ['113:10', '113:11', '113:22', '113:23'],
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MAX',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'HUG',
          layoutSizingHorizontal: 'FIXED',
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8941176533699036,
                g: 0.9137254953384399,
                b: 0.9490196108818054,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:f5613063210cb55c4f22591497c139340720b4f9/2:116]',
              },
            },
          ],
          dashPattern: [],
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.9843137264251709,
                g: 0.9882352948188782,
                b: 1,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:c94c4b118e67ccdd520018116c235719f1c770a6/7:138]',
              },
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          layoutMode: 'VERTICAL',
          width: 1060,
          height: 391,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          paddingLeft: 40,
          paddingRight: 40,
          paddingTop: 30,
          paddingBottom: 30,
          itemSpacing: 20,
          counterAxisSpacing: 0,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:10',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:9',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 30,
          rotation: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '간편 로그인 연동',
          fontName: {
            family: 'SUIT',
            style: 'Bold',
          },
          fontSize: 20,
          fontWeight: 700,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '간편 로그인 연동',
              start: 0,
              end: 9,
              fontSize: 20,
              fontName: {
                family: 'SUIT',
                style: 'Bold',
              },
              fontWeight: 700,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:1a8fd81b1ba260740f7ddf31569a7ab10c0ec384,23:15',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:11',
          name: 'Frame 1597884446',
          type: 'FRAME',
          visible: true,
          parent: '113:9',
          children: ['113:12', '113:17'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 96,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:12',
          name: 'Frame 14697',
          type: 'FRAME',
          visible: true,
          parent: '113:11',
          children: ['113:13', '113:14', '113:15'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 48,
          rotation: 0,
          cornerRadius: 10,
          topLeftRadius: 10,
          topRightRadius: 10,
          bottomLeftRadius: 10,
          bottomRightRadius: 10,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 12,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 12,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:13',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:12',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 801,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '카카오',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 16,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '카카오',
              start: 0,
              end: 3,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:ff39719a4f4432493ec910934cf96b8acdefc1ab,7:190',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:14',
          name: '723,457 hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:12',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.5046297907829285,
                g: 0.5046297907829285,
                b: 0.5555557012557983,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:b9921dbe36f26ff05978e014dac901b29f2a12f4/2:362]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 42,
          height: 23,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '연결 전',
          fontName: {
            family: 'SUIT',
            style: 'Regular',
          },
          fontSize: 15,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -0.5,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '연결 전',
              start: 0,
              end: 4,
              fontSize: 15,
              fontName: {
                family: 'SUIT',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -0.5,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.5046297907829285,
                    g: 0.5046297907829285,
                    b: 0.5555557012557983,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:b9921dbe36f26ff05978e014dac901b29f2a12f4/2:362]',
                  },
                },
              ],
              textStyleId: 'S:8de3e75e8aa9e74fc05518a1daedc751ba038ca3,2:423',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:15',
          name: 'Frame 48098137',
          type: 'FRAME',
          visible: true,
          parent: '113:12',
          children: ['113:16'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.24313725531101227,
                g: 0.545098066329956,
                b: 0.886274516582489,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:62aa73c4d05c5df2860e80c700538556e877e723/2:69]',
              },
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.24313725531101227,
                g: 0.545098066329956,
                b: 0.886274516582489,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:62aa73c4d05c5df2860e80c700538556e877e723/2:69]',
              },
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 73,
          height: 24,
          rotation: 0,
          cornerRadius: 100,
          topLeftRadius: 100,
          topRightRadius: 100,
          bottomLeftRadius: 100,
          bottomRightRadius: 100,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 4,
          paddingBottom: 4,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 12,
            paddingRight: 12,
            paddingTop: 4,
            paddingBottom: 4,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:16',
          name: '인증하기',
          type: 'TEXT',
          visible: true,
          parent: '113:15',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 49,
          height: 16,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '인증하기',
          fontName: {
            family: 'Pretendard',
            style: 'Medium',
          },
          fontSize: 14,
          fontWeight: 500,
          lineHeight: {
            unit: 'PIXELS',
            value: 16,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '인증하기',
              start: 0,
              end: 4,
              fontSize: 14,
              fontName: {
                family: 'Pretendard',
                style: 'Medium',
              },
              fontWeight: 500,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PIXELS',
                value: 16,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: 'S:a3848da5fdda46625c1895179c2bcba88a32539a,24:34',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:17',
          name: 'Frame 14696',
          type: 'FRAME',
          visible: true,
          parent: '113:11',
          children: ['113:18', '113:19', '113:20'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 48,
          rotation: 0,
          cornerRadius: 10,
          topLeftRadius: 10,
          topRightRadius: 10,
          bottomLeftRadius: 10,
          bottomRightRadius: 10,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 12,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 12,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:18',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:17',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 711,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '구글',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 16,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '구글',
              start: 0,
              end: 2,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:ff39719a4f4432493ec910934cf96b8acdefc1ab,7:190',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:19',
          name: '723,457 hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:17',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.5046297907829285,
                g: 0.5046297907829285,
                b: 0.5555557012557983,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:b9921dbe36f26ff05978e014dac901b29f2a12f4/2:362]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 132,
          height: 23,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: 'cooolvita@gmail.com',
          fontName: {
            family: 'SUIT',
            style: 'Regular',
          },
          fontSize: 15,
          fontWeight: 400,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -0.5,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: 'cooolvita@gmail.com',
              start: 0,
              end: 19,
              fontSize: 15,
              fontName: {
                family: 'SUIT',
                style: 'Regular',
              },
              fontWeight: 400,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -0.5,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.5046297907829285,
                    g: 0.5046297907829285,
                    b: 0.5555557012557983,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:b9921dbe36f26ff05978e014dac901b29f2a12f4/2:362]',
                  },
                },
              ],
              textStyleId: 'S:8de3e75e8aa9e74fc05518a1daedc751ba038ca3,2:423',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:20',
          name: 'Frame 48098137',
          type: 'FRAME',
          visible: true,
          parent: '113:17',
          children: ['113:21'],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.24313725531101227,
                g: 0.545098066329956,
                b: 0.886274516582489,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:62aa73c4d05c5df2860e80c700538556e877e723/2:69]',
              },
            },
          ],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.24313725531101227,
                g: 0.545098066329956,
                b: 0.886274516582489,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:62aa73c4d05c5df2860e80c700538556e877e723/2:69]',
              },
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 73,
          height: 24,
          rotation: 0,
          cornerRadius: 100,
          topLeftRadius: 100,
          topRightRadius: 100,
          bottomLeftRadius: 100,
          bottomRightRadius: 100,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'CENTER',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 4,
          paddingBottom: 4,
          itemSpacing: 10,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 12,
            paddingRight: 12,
            paddingTop: 4,
            paddingBottom: 4,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'INHERIT',
            layoutGrow: 0,
            itemSpacing: 10,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:21',
          name: '인증하기',
          type: 'TEXT',
          visible: true,
          parent: '113:20',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 49,
          height: 16,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'HUG',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          characters: '인증하기',
          fontName: {
            family: 'Pretendard',
            style: 'Medium',
          },
          fontSize: 14,
          fontWeight: 500,
          lineHeight: {
            unit: 'PIXELS',
            value: 16,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: 0,
          },
          textAutoResize: 'WIDTH_AND_HEIGHT',
          textAlignHorizontal: 'CENTER',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '인증하기',
              start: 0,
              end: 4,
              fontSize: 14,
              fontName: {
                family: 'Pretendard',
                style: 'Medium',
              },
              fontWeight: 500,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PIXELS',
                value: 16,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: 0,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                  },
                  boundVariables: {},
                },
              ],
              textStyleId: 'S:a3848da5fdda46625c1895179c2bcba88a32539a,24:34',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:22',
          name: 'Rectangle 39794',
          type: 'RECTANGLE',
          visible: true,
          parent: '113:9',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8941176533699036,
                g: 0.9137254953384399,
                b: 0.9490196108818054,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:f5613063210cb55c4f22591497c139340720b4f9/2:116]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 1,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '113:23',
          name: 'Frame 1597884445',
          type: 'FRAME',
          visible: true,
          parent: '113:9',
          children: ['113:24', '113:28', '113:32'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 144,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'VERTICAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'VERTICAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:24',
          name: 'Frame 14701',
          type: 'FRAME',
          visible: true,
          parent: '113:23',
          children: ['113:25', '113:26'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 48,
          rotation: 0,
          cornerRadius: 10,
          topLeftRadius: 10,
          topRightRadius: 10,
          bottomLeftRadius: 10,
          bottomRightRadius: 10,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 12,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 12,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:25',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:24',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 904,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '서비스 이용약관',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 16,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '서비스 이용약관',
              start: 0,
              end: 8,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:ff39719a4f4432493ec910934cf96b8acdefc1ab,7:190',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:26',
          name: 'ic:round-arrow-left',
          type: 'FRAME',
          visible: true,
          parent: '113:24',
          children: ['113:27'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 24,
          height: 24,
          rotation: -180,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:27',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '113:26',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.6196078658103943,
                g: 0.6196078658103943,
                b: 0.6196078658103943,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:6e4f1696da68f73d5c140882dee1f94e56df5222/7:272]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 4.59244441986084,
          height: 7.1804890632629395,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '113:28',
          name: 'Frame 14699',
          type: 'FRAME',
          visible: true,
          parent: '113:23',
          children: ['113:29', '113:30'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 48,
          rotation: 0,
          cornerRadius: 10,
          topLeftRadius: 10,
          topRightRadius: 10,
          bottomLeftRadius: 10,
          bottomRightRadius: 10,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 12,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 12,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:29',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:28',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 904,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '개인정보 처리방침',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 16,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '개인정보 처리방침',
              start: 0,
              end: 9,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:ff39719a4f4432493ec910934cf96b8acdefc1ab,7:190',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:30',
          name: 'ic:round-arrow-left',
          type: 'FRAME',
          visible: true,
          parent: '113:28',
          children: ['113:31'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 24,
          height: 24,
          rotation: -180,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:31',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '113:30',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.6196078658103943,
                g: 0.6196078658103943,
                b: 0.6196078658103943,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:6e4f1696da68f73d5c140882dee1f94e56df5222/7:272]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 4.59244441986084,
          height: 7.1804890632629395,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '113:32',
          name: 'Frame 14700',
          type: 'FRAME',
          visible: true,
          parent: '113:23',
          children: ['113:33', '113:34'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 980,
          height: 48,
          rotation: 0,
          cornerRadius: 10,
          topLeftRadius: 10,
          topRightRadius: 10,
          bottomLeftRadius: 10,
          bottomRightRadius: 10,
          layoutMode: 'HORIZONTAL',
          layoutAlign: 'STRETCH',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 12,
          paddingBottom: 12,
          itemSpacing: 12,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 20,
            paddingRight: 20,
            paddingTop: 12,
            paddingBottom: 12,
            counterAxisSizingMode: 'AUTO',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 12,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:33',
          name: 'Hotels',
          type: 'TEXT',
          visible: true,
          parent: '113:32',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.22745098173618317,
                g: 0.20000000298023224,
                b: 0.2078431397676468,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 904,
          height: 24,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 1,
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 0,
          strokeAlign: 'CENTER',
          dashPattern: [],
          characters: '회원 탈퇴',
          fontName: {
            family: 'SUIT',
            style: 'SemiBold',
          },
          fontSize: 16,
          fontWeight: 600,
          lineHeight: {
            unit: 'PERCENT',
            value: 150,
          },
          letterSpacing: {
            unit: 'PIXELS',
            value: -1,
          },
          textAutoResize: 'HEIGHT',
          textAlignHorizontal: 'LEFT',
          textAlignVertical: 'TOP',
          textTruncation: 'DISABLED',
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          styledTextSegments: [
            {
              characters: '회원 탈퇴',
              start: 0,
              end: 5,
              fontSize: 16,
              fontName: {
                family: 'SUIT',
                style: 'SemiBold',
              },
              fontWeight: 600,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: {
                unit: 'PERCENT',
                value: 150,
              },
              letterSpacing: {
                unit: 'PIXELS',
                value: -1,
              },
              fills: [
                {
                  type: 'SOLID',
                  visible: true,
                  opacity: 1,
                  blendMode: 'NORMAL',
                  color: {
                    r: 0.22745098173618317,
                    g: 0.20000000298023224,
                    b: 0.2078431397676468,
                  },
                  boundVariables: {
                    color:
                      '[NodeId: VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137]',
                  },
                },
              ],
              textStyleId: 'S:ff39719a4f4432493ec910934cf96b8acdefc1ab,7:190',
              fillStyleId: '',
              listOptions: {
                type: 'NONE',
              },
              indentation: 0,
              hyperlink: null,
            },
          ],
        },
        {
          id: '113:34',
          name: 'ic:round-arrow-left',
          type: 'FRAME',
          visible: true,
          parent: '113:32',
          children: ['113:35'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 24,
          height: 24,
          rotation: -180,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: true,
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '113:35',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '113:34',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.6196078658103943,
                g: 0.6196078658103943,
                b: 0.6196078658103943,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:6e4f1696da68f73d5c140882dee1f94e56df5222/7:272]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 4.59244441986084,
          height: 7.1804890632629395,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '189:1785',
          name: 'Test Case : 드론아레나',
          type: 'SECTION',
          children: ['113:9'],
        },
      ],
      variables: [
        {
          id: 'VariableID:f5613063210cb55c4f22591497c139340720b4f9/2:116',
          name: 'border',
        },
        {
          id: 'VariableID:c94c4b118e67ccdd520018116c235719f1c770a6/7:138',
          name: 'primaryBg',
        },
        {
          id: 'VariableID:57475e52516076fee3a8936d875fd8baaa61a342/2:137',
          name: 'text',
        },
        {
          id: 'VariableID:b9921dbe36f26ff05978e014dac901b29f2a12f4/2:362',
          name: 'gray500',
        },
        {
          id: 'VariableID:62aa73c4d05c5df2860e80c700538556e877e723/2:69',
          name: 'primary',
        },
        {
          id: 'VariableID:6e4f1696da68f73d5c140882dee1f94e56df5222/7:272',
          name: 'gray300',
        },
      ],
    },
    // many shape
    {
      expected: `<Box
  bg="#D9D9D9"
  boxSize="100px"
  maskImage="url(/icons/Star7.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
      nodes: [
        {
          id: '188:1567',
          name: 'Star7',
          type: 'STAR',
          reactions: [],
          parent: '188:1572',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          width: 100,
          height: 100,
          cornerRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: true,
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['188:1567'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#D9D9D9"
  boxSize="100px"
  maskImage="url(/icons/Polygon1.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
      nodes: [
        {
          id: '188:1568',
          name: 'Polygon1',
          type: 'VECTOR',
          reactions: [],
          parent: '188:1572',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          width: 100,
          height: 100,
          cornerRadius: 0,
          strokes: [],
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: true,
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['188:1568'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box
  bg="#D9D9D9"
  boxSize="100px"
  maskImage="url(/icons/Polygon1.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
      nodes: [
        {
          id: '189:1590',
          name: 'Polygon1',
          type: 'POLYGON',
          visible: true,
          parent: '188:1572',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.8509804010391235,
                g: 0.8509804010391235,
                b: 0.8509804010391235,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 100,
          height: 100,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['189:1590'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box maxW="calc(140px - 8px)" outline="solid 4px #F00" transform="translate(4px, -4px)" w="140px" />`,
      nodes: [
        {
          id: '188:1569',
          name: 'Line 1',
          type: 'LINE',
          visible: true,
          parent: '188:1572',
          fills: [],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 140,
          height: 0,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 4,
          strokeAlign: 'CENTER',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['188:1569'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box maxW="calc(140px - 6px)" outline="solid 3px #FF000080" transform="translate(3px, -3px)" w="140px" />`,
      nodes: [
        {
          id: '216:1548',
          name: 'Line 8',
          type: 'LINE',
          visible: true,
          parent: '188:1572',
          fills: [],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 0.5,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 140,
          height: 0,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 3,
          strokeAlign: 'CENTER',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['216:1548'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box maxW="calc(140px - 6px)" outline="solid 3px #F00" transform="translate(3px, -3px)" w="140px" />`,
      nodes: [
        {
          id: '189:1582',
          name: 'Line 2',
          type: 'LINE',
          visible: true,
          parent: '188:1572',
          fills: [],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 140,
          height: 0,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 3,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['189:1582'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box maxW="calc(140px - 8px)" outline="solid 4px #F00" transform="translate(4px, -4px)" w="140px" />`,
      nodes: [
        {
          id: '189:1586',
          name: 'Line 3',
          type: 'LINE',
          visible: true,
          parent: '188:1572',
          fills: [],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 140,
          height: 0,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 4,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['189:1586'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box maxW="calc(150px - 2px)" outline="solid 1px #F00" transform="rotate(-15deg)" w="150px" />`,
      nodes: [
        {
          id: '199:1545',
          name: 'Line4',
          type: 'LINE',
          visible: true,
          parent: '188:1572',
          fills: [],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 150,
          height: 0,
          rotation: 15.000000120055855,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['199:1545'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Box maxW="calc(131px - 2px)" outline="solid 1px #F00" transform="rotate(-90deg)" w="131px" />`,
      nodes: [
        {
          id: '199:1554',
          name: 'Line 7',
          type: 'LINE',
          visible: true,
          parent: '188:1572',
          fills: [],
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 131,
          height: 0,
          rotation: 90,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'CENTER',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['199:1554'],
        },
      ],
      variables: [],
    },
    {
      expected: `<Image h="60px" src="/icons/Vector4.svg" w="280px" />`,
      nodes: [
        {
          id: '188:1571',
          name: 'Vector4',
          type: 'VECTOR',
          reactions: [],
          parent: '188:1572',
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          width: 280,
          height: 60,
          cornerRadius: 0,
          strokes: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0,
                g: 0,
                b: 0,
              },
              boundVariables: {},
            },
          ],
          dashPattern: [],
          strokeWeight: 1,
          strokeAlign: 'CENTER',
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          visible: true,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1572',
          name: '다양한 도형',
          type: 'SECTION',
          children: ['188:1571'],
        },
      ],
      variables: [],
    },
    // svg detail
    {
      expected: `<Image h="28px" src="/icons/DevupUI.svg" />`,
      nodes: [
        {
          id: '188:1552',
          name: 'DevupUI',
          type: 'FRAME',
          inferredAutoLayout: {
            layoutMode: 'HORIZONTAL',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'CENTER',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'MIN',
            layoutGrow: 0,
            itemSpacing: 8,
            layoutPositioning: 'AUTO',
          },
          reactions: [],
          parent: '189:1599',
          children: ['188:1553', '188:1557'],
          maxWidth: null,
          maxHeight: null,
          minWidth: null,
          minHeight: null,
          layoutPositioning: 'AUTO',
          layoutSizingVertical: 'FIXED',
          layoutSizingHorizontal: 'FIXED',
          height: 28,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomRightRadius: 0,
          bottomLeftRadius: 0,
          strokes: [],
          fills: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          isAsset: false,
          effects: [],
          rotation: 0,
          clipsContent: false,
          visible: true,
          width: 128,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'CENTER',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 8,
          counterAxisSpacing: 0,
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '188:1553',
          name: 'Group 1',
          type: 'GROUP',
          visible: true,
          parent: '188:1552',
          children: ['188:1554', '188:1555', '188:1556'],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 28,
          height: 28,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'AUTO',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'STRETCH',
            layoutGrow: 0,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1554',
          name: 'Star 5',
          type: 'STAR',
          visible: true,
          parent: '188:1553',
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 1,
                    g: 0.8097218871116638,
                    b: 0.9968286752700806,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 0.6626253724098206,
                    g: 0.7285662889480591,
                    b: 0.9263890385627747,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [6.123234262925839e-17, 1, 0],
                [-1, 6.123234262925839e-17, 1],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 28,
          height: 28,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1555',
          name: 'Star 6',
          type: 'STAR',
          visible: true,
          parent: '188:1553',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 0.4000000059604645,
              blendMode: 'NORMAL',
              color: {
                r: 1,
                g: 1,
                b: 1,
              },
              boundVariables: {},
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 28,
          height: 28,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1556',
          name: 'Vector 2',
          type: 'VECTOR',
          visible: true,
          parent: '188:1553',
          fills: [
            {
              type: 'GRADIENT_LINEAR',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              gradientStops: [
                {
                  color: {
                    r: 0.9651618599891663,
                    g: 0.940277636051178,
                    b: 1,
                    a: 1,
                  },
                  position: 0,
                  boundVariables: {},
                },
                {
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                    a: 1,
                  },
                  position: 1,
                  boundVariables: {},
                },
              ],
              gradientTransform: [
                [6.123234262925839e-17, 1, 0],
                [-1, 6.123234262925839e-17, 1],
              ],
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 16.983606338500977,
          height: 16.180328369140625,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'CENTER',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1557',
          name: 'Frame 3',
          type: 'FRAME',
          visible: true,
          parent: '188:1552',
          children: ['188:1558'],
          fills: [],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 92,
          height: 28,
          rotation: 0,
          cornerRadius: 0,
          topLeftRadius: 0,
          topRightRadius: 0,
          bottomLeftRadius: 0,
          bottomRightRadius: 0,
          layoutMode: 'NONE',
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          primaryAxisAlignItems: 'MIN',
          counterAxisAlignItems: 'MIN',
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          paddingBottom: 0,
          itemSpacing: 0,
          counterAxisSpacing: 0,
          clipsContent: false,
          isAsset: true,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          inferredAutoLayout: {
            layoutMode: 'NONE',
            paddingLeft: 0,
            paddingRight: 0,
            paddingTop: 0,
            paddingBottom: 0,
            counterAxisSizingMode: 'FIXED',
            primaryAxisSizingMode: 'FIXED',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'MIN',
            layoutAlign: 'STRETCH',
            layoutGrow: 1,
            itemSpacing: 0,
            layoutPositioning: 'AUTO',
          },
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeBottomWeight: 1,
          strokeLeftWeight: 1,
          strokeRightWeight: 1,
          strokeAlign: 'INSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
          gridColumnCount: 0,
        },
        {
          id: '188:1558',
          name: 'Devup UI',
          type: 'GROUP',
          visible: true,
          parent: '188:1557',
          children: [
            '188:1559',
            '188:1560',
            '188:1561',
            '188:1562',
            '188:1563',
            '188:1564',
            '188:1565',
          ],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 92,
          height: 20,
          rotation: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1559',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 2.97971248626709,
          height: 15.238091468811035,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1560',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.797364234924316,
          height: 15.471328735351562,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1561',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 12.350691795349121,
          height: 16.30708885192871,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1562',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 10.839245796203613,
          height: 11.545185089111328,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1563',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 11.983627319335938,
          height: 11.350822448730469,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1564',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 12.350696563720703,
          height: 11.739547729492188,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '188:1565',
          name: 'Vector',
          type: 'VECTOR',
          visible: true,
          parent: '188:1558',
          fills: [
            {
              type: 'SOLID',
              visible: true,
              opacity: 1,
              blendMode: 'NORMAL',
              color: {
                r: 0.18431372940540314,
                g: 0.18431372940540314,
                b: 0.18431372940540314,
              },
              boundVariables: {
                color:
                  '[NodeId: VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40]',
              },
            },
          ],
          strokes: [],
          effects: [],
          opacity: 1,
          blendMode: 'PASS_THROUGH',
          width: 13.538261413574219,
          height: 15.238091468811035,
          rotation: 0,
          cornerRadius: 0,
          layoutAlign: 'INHERIT',
          layoutGrow: 0,
          layoutSizingHorizontal: 'FIXED',
          layoutSizingVertical: 'FIXED',
          layoutPositioning: 'AUTO',
          isAsset: false,
          reactions: [],
          minWidth: null,
          maxWidth: null,
          minHeight: null,
          maxHeight: null,
          strokeWeight: 1,
          strokeAlign: 'OUTSIDE',
          dashPattern: [],
          gridColumnAnchorIndex: -1,
          gridRowAnchorIndex: -1,
        },
        {
          id: '189:1599',
          name: 'SVG - detail',
          type: 'SECTION',
          children: ['188:1552'],
        },
      ],
      variables: [
        {
          id: 'VariableID:228af354eb8741f69bcd91fe730fec0505e9eac9/19:40',
          name: 'text',
        },
        {
          id: 'VariableID:5ed5fe4e2c110aae522cfe81f189c59552683358/18:227',
          name: 'primaryBgLight',
        },
        {
          id: 'VariableID:51a40441a4e76d70d58452cb534b842a89c22c63/14:47',
          name: 'primary',
        },
        {
          id: 'VariableID:331c673285290a0918108f25061f5c757824db3b/11:20',
          name: 'containerBackground',
        },
        {
          id: 'VariableID:54a5e49a31d11583de0ae1faa3ec4bf26bd03a86/14:112',
          name: 'gray200',
        },
        {
          id: 'VariableID:93d8aadc9ec1c35e7c24bdf723b9b05a01b75a2d/14:70',
          name: 'textLight',
        },
      ],
    },
  ] as const)('$expected', async ({ expected, nodes, variables }) => {
    const root = assembleNodeTree(
      nodes as unknown as NodeData[],
      variables as { id: string; name: string }[] | undefined,
    )
    const codegen = new Codegen(root as unknown as SceneNode)
    await codegen.run()
    expect(codegen.getCode()).toBe(expected)
  })
})
