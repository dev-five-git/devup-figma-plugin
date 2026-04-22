import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { resetVariableCache } from '../../utils/variable-cache'
import { getAutoLayoutProps } from '../auto-layout'
import { getBorderProps, getBorderRadiusProps } from '../border'
import { getEffectProps } from '../effect'
import { getLayoutProps, getMinMaxProps } from '../layout'
import { getPaddingProps } from '../padding'
import { getTextShadowProps } from '../text-shadow'

function setupFigmaMocks(options?: {
  variableNamesById?: Record<string, string | null>
  styleNamesById?: Record<string, string | null>
}): void {
  const variableNamesById = options?.variableNamesById ?? {}
  const styleNamesById = options?.styleNamesById ?? {}

  ;(globalThis as { figma?: unknown }).figma = {
    mixed: Symbol('mixed'),
    util: { rgba: (v: unknown) => v },
    getStyleByIdAsync: mock(async (id: string) => {
      const name = styleNamesById[id]
      if (!name) return null
      return { id, name }
    }),
    variables: {
      getVariableByIdAsync: mock(async (id: string) => {
        const name = variableNamesById[id]
        if (!name) return null
        return { id, name }
      }),
    },
  } as unknown as typeof figma
}

describe('length bound variables (padding / gap / size / radius)', () => {
  beforeEach(() => {
    resetVariableCache()
  })

  test('getPaddingProps resolves node.boundVariables padding variables', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-padding': 'layout/padding/md',
      },
    })

    const node = {
      type: 'FRAME',
      inferredAutoLayout: {
        paddingTop: 16,
        paddingRight: 16,
        paddingBottom: 16,
        paddingLeft: 16,
      },
      boundVariables: {
        paddingTop: { id: 'var-padding' },
        paddingRight: { id: 'var-padding' },
        paddingBottom: { id: 'var-padding' },
        paddingLeft: { id: 'var-padding' },
      },
    } as unknown as SceneNode

    expect(await getPaddingProps(node)).toEqual({ p: '$layoutPaddingMd' })
  })

  test('getAutoLayoutProps resolves itemSpacing variable as gap', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-gap': 'spacing/l',
      },
    })

    const node = {
      type: 'FRAME',
      inferredAutoLayout: {
        layoutMode: 'HORIZONTAL',
        itemSpacing: 8,
      },
      primaryAxisAlignItems: 'MIN',
      counterAxisAlignItems: 'CENTER',
      children: [{ visible: true }, { visible: true }],
      boundVariables: {
        itemSpacing: { id: 'var-gap' },
      },
    } as unknown as SceneNode

    expect(await getAutoLayoutProps(node)).toEqual({
      display: 'flex',
      flexDir: 'row',
      gap: '$spacingL',
      justifyContent: 'flex-start',
      alignItems: 'center',
    })
  })

  test('getLayoutProps resolves width/height variables on absolute nodes', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-width': 'size/card/width',
        'var-height': 'size/card/height',
      },
    })

    const node = {
      type: 'RECTANGLE',
      width: 120,
      height: 40,
      children: [],
      parent: { width: 500 },
      boundVariables: {
        width: { id: 'var-width' },
        height: { id: 'var-height' },
      },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: true,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
      }),
    ).toEqual({
      w: '$sizeCardWidth',
      h: '$sizeCardHeight',
    })
  })

  test('getLayoutProps uses sync absolute sizing path when no bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'RECTANGLE',
      width: 120,
      height: 40,
      children: [],
      parent: { width: 500 },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: true,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
      }),
    ).toEqual({
      w: '120px',
      h: '40px',
    })
  })

  test('getLayoutProps uses sync fixed sizing path when no bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      width: 320,
      height: 180,
      maxWidth: null,
      maxHeight: null,
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
      }),
    ).toEqual({
      aspectRatio: undefined,
      flex: undefined,
      w: '320px',
      h: '180px',
    })
  })

  test('getLayoutProps uses sync text width path when no bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'TEXT',
      width: 140,
      textAutoResize: 'HEIGHT',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as TextNode

    expect(
      await getLayoutProps(node as unknown as SceneNode, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
      }),
    ).toEqual({
      w: '140px',
    })
  })

  test('getLayoutProps resolves text width variable when textAutoResize is HEIGHT', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-text-width': 'text/width',
      },
    })

    const node = {
      type: 'TEXT',
      width: 140,
      textAutoResize: 'HEIGHT',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      boundVariables: {
        width: { id: 'var-text-width' },
      },
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as TextNode

    expect(
      await getLayoutProps(node as unknown as SceneNode, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
        boundVariables: {
          width: { id: 'var-text-width' },
        },
      }),
    ).toEqual({
      w: '$textWidth',
    })
  })

  test('getLayoutProps returns empty object for variable-backed WIDTH_AND_HEIGHT text', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-text-width-2': 'text/width2',
      },
    })

    const node = {
      type: 'TEXT',
      width: 140,
      textAutoResize: 'WIDTH_AND_HEIGHT',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      boundVariables: {
        width: { id: 'var-text-width-2' },
      },
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as TextNode

    expect(
      await getLayoutProps(node as unknown as SceneNode, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
        boundVariables: {
          width: { id: 'var-text-width-2' },
        },
      }),
    ).toEqual({})
  })

  test('getLayoutProps falls through NONE text auto resize to fixed variable sizing', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-text-width-3': 'text/width3',
        'var-text-height-3': 'text/height3',
      },
    })

    const node = {
      type: 'TEXT',
      width: 140,
      height: 32,
      textAutoResize: 'NONE',
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      maxWidth: null,
      maxHeight: null,
      boundVariables: {
        width: { id: 'var-text-width-3' },
        height: { id: 'var-text-height-3' },
      },
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as TextNode

    expect(
      await getLayoutProps(node as unknown as SceneNode, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
        boundVariables: {
          width: { id: 'var-text-width-3' },
          height: { id: 'var-text-height-3' },
        },
      }),
    ).toEqual({
      aspectRatio: undefined,
      flex: undefined,
      w: '$textWidth3',
      h: '$textHeight3',
    })
  })

  test('getLayoutProps handles variable-backed fixed sizing in normal flow', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-frame-width': 'frame/width',
        'var-frame-height': 'frame/height',
      },
    })

    const node = {
      type: 'FRAME',
      width: 320,
      height: 180,
      maxWidth: null,
      maxHeight: null,
      layoutSizingHorizontal: 'FIXED',
      layoutSizingVertical: 'FIXED',
      boundVariables: {
        width: { id: 'var-frame-width' },
        height: { id: 'var-frame-height' },
      },
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
        boundVariables: {
          width: { id: 'var-frame-width' },
          height: { id: 'var-frame-height' },
        },
      }),
    ).toEqual({
      aspectRatio: undefined,
      flex: undefined,
      w: '$frameWidth',
      h: '$frameHeight',
    })
  })

  test('getLayoutProps absolute variable path can leave width undefined for non-asset containers with children', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-abs-width': 'abs/width',
        'var-abs-height': 'abs/height',
      },
    })

    const node = {
      type: 'FRAME',
      width: 120,
      height: 40,
      children: [{}],
      parent: { width: 500 },
      boundVariables: {
        width: { id: 'var-abs-width' },
        height: { id: 'var-abs-height' },
      },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: true,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
        boundVariables: {
          width: { id: 'var-abs-width' },
          height: { id: 'var-abs-height' },
        },
      }),
    ).toEqual({
      w: undefined,
      h: undefined,
    })
  })

  test('getLayoutProps variable-backed fill sizing resolves to 100% when max constraints exist', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-fill-width': 'fill/width',
        'var-fill-height': 'fill/height',
      },
    })

    const node = {
      type: 'FRAME',
      width: 320,
      height: 180,
      maxWidth: 500,
      maxHeight: 400,
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'FILL',
      boundVariables: {
        width: { id: 'var-fill-width' },
        height: { id: 'var-fill-height' },
      },
      parent: {
        layoutMode: 'VERTICAL',
      },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
        boundVariables: {
          width: { id: 'var-fill-width' },
          height: { id: 'var-fill-height' },
        },
      }),
    ).toEqual({
      aspectRatio: undefined,
      boxSize: '100%',
      flex: undefined,
    })
  })

  test('getLayoutProps returns fill sizing when parent shrinks width and height', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      width: 100,
      height: 80,
      maxWidth: null,
      maxHeight: null,
      layoutSizingHorizontal: 'FILL',
      layoutSizingVertical: 'FILL',
      parent: {
        layoutMode: 'HORIZONTAL',
        primaryAxisSizingMode: 'AUTO',
        counterAxisSizingMode: 'AUTO',
      },
    } as unknown as SceneNode

    expect(
      await getLayoutProps(node, {
        canBeAbsolute: false,
        isAsset: null,
        isPageRoot: false,
        pageNode: null,
      }),
    ).toEqual({
      aspectRatio: undefined,
      flex: 1,
      w: undefined,
      h: undefined,
    })
  })

  test('getMinMaxProps resolves min/max variables with fallback to px', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-min-width': 'size/min/width',
        'var-max-height': 'size/max/height',
      },
    })

    const node = {
      type: 'FRAME',
      minWidth: 100,
      maxWidth: 500,
      minHeight: 80,
      maxHeight: 400,
      boundVariables: {
        minWidth: { id: 'var-min-width' },
        maxHeight: { id: 'var-max-height' },
      },
    } as unknown as SceneNode

    expect(await getMinMaxProps(node)).toEqual({
      minW: '$sizeMinWidth',
      maxW: '500px',
      minH: '80px',
      maxH: '$sizeMaxHeight',
    })
  })

  test('getMinMaxProps uses sync path when no bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      minWidth: 100,
      maxWidth: 500,
      minHeight: 80,
      maxHeight: 400,
    } as unknown as SceneNode

    expect(await getMinMaxProps(node)).toEqual({
      minW: '100px',
      maxW: '500px',
      minH: '80px',
      maxH: '400px',
    })
  })

  test('getBorderRadiusProps resolves corner radius variables with shorthand optimization', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-radius-a': 'radius/a',
        'var-radius-b': 'radius/b',
      },
    })

    const node = {
      type: 'RECTANGLE',
      topLeftRadius: 8,
      topRightRadius: 4,
      bottomRightRadius: 8,
      bottomLeftRadius: 4,
      boundVariables: {
        topLeftRadius: { id: 'var-radius-a' },
        bottomRightRadius: { id: 'var-radius-a' },
        topRightRadius: { id: 'var-radius-b' },
        bottomLeftRadius: { id: 'var-radius-b' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '$radiusA $radiusB',
    })
  })

  test('getBorderRadiusProps uses sync shorthand path when no bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'RECTANGLE',
      topLeftRadius: 8,
      topRightRadius: 4,
      bottomRightRadius: 8,
      bottomLeftRadius: 4,
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '8px 4px',
    })
  })

  test('getBorderRadiusProps uses sync ellipse path when no bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'ELLIPSE',
      arcData: { innerRadius: 0 },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '50%',
    })
  })

  test('getBorderRadiusProps resolves single cornerRadius variable without corner fields', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-corner': 'radius/corner',
      },
    })

    const node = {
      type: 'RECTANGLE',
      cornerRadius: 12,
      boundVariables: {
        cornerRadius: { id: 'var-corner' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '$radiusCorner',
    })
  })

  test('getBorderRadiusProps falls back to raw corner shorthand when corner variables are unresolved', async () => {
    setupFigmaMocks()

    const node = {
      type: 'RECTANGLE',
      topLeftRadius: 8,
      topRightRadius: 4,
      bottomRightRadius: 8,
      bottomLeftRadius: 4,
      boundVariables: {
        topLeftRadius: { id: 'missing-top-left' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '8px 4px',
    })
  })

  test('getBorderRadiusProps returns ellipse radius even when unrelated bound variables exist', async () => {
    setupFigmaMocks()

    const node = {
      type: 'ELLIPSE',
      arcData: { innerRadius: 0 },
      boundVariables: {
        width: { id: 'missing-width' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '50%',
    })
  })

  test('getBorderRadiusProps falls back to raw cornerRadius when variable is unresolved', async () => {
    setupFigmaMocks()

    const node = {
      type: 'RECTANGLE',
      cornerRadius: 12,
      boundVariables: {
        cornerRadius: { id: 'missing-corner' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '12px',
    })
  })

  test('getBorderProps uses simple stroke fast path for border', async () => {
    setupFigmaMocks()

    const node = {
      type: 'RECTANGLE',
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 },
        },
      ],
      strokeWeight: 2,
      strokeAlign: 'INSIDE',
      dashPattern: [],
    } as unknown as SceneNode

    expect(await getBorderProps(node)).toEqual({
      border: 'solid 2px #F00',
    })
  })

  test('getBorderProps uses simple stroke fast path for outline line', async () => {
    setupFigmaMocks()

    const node = {
      type: 'LINE',
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 0, g: 0, b: 1, a: 1 },
        },
      ],
      strokeWeight: 2,
      strokeAlign: 'CENTER',
      dashPattern: [],
      layoutSizingHorizontal: 'FIXED',
      width: 100,
    } as unknown as SceneNode

    expect(await getBorderProps(node)).toEqual({
      outline: 'solid 2px #00F',
      outlineOffset: null,
      maxW: 'calc(100px - 4px)',
      transform: 'translate(2px, -2px)',
    })
  })

  test('getBorderProps handles multi-stroke mixed weights path', async () => {
    setupFigmaMocks()

    const node = {
      type: 'RECTANGLE',
      strokes: [
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 1, g: 0, b: 0, a: 1 },
        },
        {
          type: 'SOLID',
          visible: true,
          opacity: 1,
          color: { r: 0, g: 0, b: 1, a: 1 },
        },
      ],
      strokeWeight: (figma as typeof figma).mixed,
      strokeTopWeight: 1,
      strokeRightWeight: 2,
      strokeBottomWeight: 3,
      strokeLeftWeight: 4,
      dashPattern: [2],
    } as unknown as SceneNode

    expect(await getBorderProps(node)).toEqual({
      borderBottom: 'dashed 3px #00F, dashed 3px linear-gradient(#F00, #F00)',
      borderTop: 'dashed 1px #00F, dashed 1px linear-gradient(#F00, #F00)',
      borderLeft: 'dashed 4px #00F, dashed 4px linear-gradient(#F00, #F00)',
      borderRight: 'dashed 2px #00F, dashed 2px linear-gradient(#F00, #F00)',
    })
  })

  test('getBorderRadiusProps collapses to single value when all corners resolve equal', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-radius': 'radius/l',
      },
    })

    const node = {
      type: 'RECTANGLE',
      topLeftRadius: 4,
      topRightRadius: 4,
      bottomRightRadius: 4,
      bottomLeftRadius: 4,
      boundVariables: {
        topLeftRadius: { id: 'var-radius' },
        topRightRadius: { id: 'var-radius' },
        bottomRightRadius: { id: 'var-radius' },
        bottomLeftRadius: { id: 'var-radius' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '$radiusL',
    })
  })

  test('getBorderRadiusProps uses three-value shorthand when top-right equals bottom-left only', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-top-left': 'radius/tl',
        'var-right-left': 'radius/rl',
      },
    })

    const node = {
      type: 'RECTANGLE',
      topLeftRadius: 8,
      topRightRadius: 6,
      bottomRightRadius: 12,
      bottomLeftRadius: 6,
      boundVariables: {
        topLeftRadius: { id: 'var-top-left' },
        topRightRadius: { id: 'var-right-left' },
        bottomLeftRadius: { id: 'var-right-left' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '$radiusTl $radiusRl 12px',
    })
  })

  test('getBorderRadiusProps uses two-value shorthand when tl===br and tr===bl', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-a': 'radiusA',
        'var-b': 'radiusB',
      },
    })

    const node = {
      type: 'RECTANGLE',
      cornerRadius: 8,
      topLeftRadius: 8,
      topRightRadius: 4,
      bottomRightRadius: 8,
      bottomLeftRadius: 4,
      boundVariables: {
        topLeftRadius: { id: 'var-a' },
        topRightRadius: { id: 'var-b' },
        bottomRightRadius: { id: 'var-a' },
        bottomLeftRadius: { id: 'var-b' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '$radiusA $radiusB',
    })
  })

  test('getBorderRadiusProps uses four-value when all corners differ', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-a': 'a',
        'var-b': 'b',
        'var-c': 'c',
        'var-d': 'd',
      },
    })

    const node = {
      type: 'RECTANGLE',
      cornerRadius: 8,
      topLeftRadius: 1,
      topRightRadius: 2,
      bottomRightRadius: 3,
      bottomLeftRadius: 4,
      boundVariables: {
        topLeftRadius: { id: 'var-a' },
        topRightRadius: { id: 'var-b' },
        bottomRightRadius: { id: 'var-c' },
        bottomLeftRadius: { id: 'var-d' },
      },
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '$a $b $c $d',
    })
  })

  test('getBorderRadiusProps falls back to cornerRadius when corner fields are unavailable', async () => {
    setupFigmaMocks()

    const node = {
      type: 'VECTOR',
      cornerRadius: 10,
    } as unknown as SceneNode

    expect(await getBorderRadiusProps(node)).toEqual({
      borderRadius: '10px',
    })
  })
})

describe('effect/text-shadow bound variables and style tokens', () => {
  beforeEach(() => {
    resetVariableCache()
  })

  test('getEffectProps resolves effectStyleId token and boundVariables in shadow string', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-shadow-x': 'shadow/offset/x',
        'var-shadow-y': 'shadow/offset/y',
        'var-shadow-radius': 'shadow/blur',
        'var-shadow-spread': 'shadow/spread',
        'var-shadow-color': 'shadow/color',
      },
      styleNamesById: {
        'style-shadow': '3/test-shadow',
      },
    })

    const node = {
      type: 'FRAME',
      effectStyleId: 'style-shadow',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 1, y: 2 },
          radius: 3,
          spread: 4,
          color: { r: 0, g: 0, b: 0, a: 0.5 },
          boundVariables: {
            offsetX: { id: 'var-shadow-x' },
            offsetY: { id: 'var-shadow-y' },
            radius: { id: 'var-shadow-radius' },
            spread: { id: 'var-shadow-spread' },
            color: { id: 'var-shadow-color' },
          },
        },
      ],
    } as unknown as SceneNode

    expect(await getEffectProps(node)).toEqual({
      boxShadow:
        '$shadowOffsetX $shadowOffsetY $shadowBlur $shadowSpread $shadowColor',
      __boxShadowToken: '$testShadow',
    })
  })

  test('getEffectProps does not set __boxShadowToken when style has no name', async () => {
    setupFigmaMocks({
      styleNamesById: {}, // style lookup returns null
    })

    const node = {
      type: 'FRAME',
      effectStyleId: 'style-no-name',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 0, y: 4 },
          radius: 8,
          spread: 0,
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    } as unknown as SceneNode

    const result = await getEffectProps(node)
    expect(result?.boxShadow).toBe('0 4px 8px 0 #000')
    expect(result?.__boxShadowToken).toBeUndefined()
  })

  test('getEffectProps does not set __boxShadowToken when effectStyleId is empty', async () => {
    setupFigmaMocks({
      styleNamesById: {
        'style-shadow': '3/test-shadow',
      },
    })

    const node = {
      type: 'FRAME',
      effectStyleId: '',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 1, y: 2 },
          radius: 3,
          spread: 4,
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    } as unknown as SceneNode

    const result = await getEffectProps(node)
    expect(result?.boxShadow).toBe('1px 2px 3px 4px #000')
    expect(result?.__boxShadowToken).toBeUndefined()
  })

  test('getEffectProps falls back to raw values when bound variable ids are unresolved', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 5, y: 7 },
          radius: 9,
          spread: 11,
          color: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
          boundVariables: {
            offsetX: { id: 'unknown-x' },
            offsetY: { id: 'unknown-y' },
            radius: { id: 'unknown-r' },
            spread: { id: 'unknown-s' },
            color: { id: 'unknown-c' },
          },
        },
      ],
    } as unknown as SceneNode

    expect(await getEffectProps(node)).toEqual({
      boxShadow: '5px 7px 9px 11px #1A334D',
    })
  })

  test('getEffectProps uses fast path for simple inner shadow without variables', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      effects: [
        {
          type: 'INNER_SHADOW',
          visible: true,
          offset: { x: 2, y: 4 },
          radius: 6,
          spread: 8,
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    } as unknown as SceneNode

    expect(await getEffectProps(node)).toEqual({
      boxShadow: 'inset 2px 4px 6px 8px #000',
    })
  })

  test('getEffectProps resolves bound variables for inner shadow', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-inner-x': 'inner/x',
        'var-inner-y': 'inner/y',
        'var-inner-r': 'inner/radius',
        'var-inner-s': 'inner/spread',
        'var-inner-c': 'inner/color',
      },
    })

    const node = {
      type: 'FRAME',
      effects: [
        {
          type: 'INNER_SHADOW',
          visible: true,
          offset: { x: 2, y: 4 },
          radius: 6,
          spread: 8,
          color: { r: 0, g: 0, b: 0, a: 1 },
          boundVariables: {
            offsetX: { id: 'var-inner-x' },
            offsetY: { id: 'var-inner-y' },
            radius: { id: 'var-inner-r' },
            spread: { id: 'var-inner-s' },
            color: { id: 'var-inner-c' },
          },
        },
      ],
    } as unknown as SceneNode

    expect(await getEffectProps(node)).toEqual({
      boxShadow: 'inset $innerX $innerY $innerRadius $innerSpread $innerColor',
    })
  })

  test('getEffectProps handles blur and texture filters', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      effects: [
        {
          type: 'LAYER_BLUR',
          visible: true,
          radius: 12,
        },
        {
          type: 'BACKGROUND_BLUR',
          visible: true,
          radius: 8,
        },
        {
          type: 'TEXTURE',
          visible: true,
        },
      ],
    } as unknown as SceneNode

    expect(await getEffectProps(node)).toEqual({
      filter: 'blur(12px), contrast(100%) brightness(100%)',
      backdropFilter: 'blur(8px)',
    })
  })

  test('getEffectProps handles noise and glass effects', async () => {
    setupFigmaMocks()

    const node = {
      type: 'FRAME',
      effects: [
        {
          type: 'NOISE',
          visible: true,
        },
        {
          type: 'GLASS',
          visible: true,
          radius: 10,
        },
      ],
    } as unknown as SceneNode

    expect(await getEffectProps(node)).toEqual({
      filter: 'contrast(100%) brightness(100%)',
      backdropFilter: 'blur(10px)',
    })
  })

  test('getTextShadowProps resolves effect style token and bound variables', async () => {
    setupFigmaMocks({
      variableNamesById: {
        'var-text-x': 'text-shadow/x',
        'var-text-y': 'text-shadow/y',
        'var-text-r': 'text-shadow/radius',
        'var-text-c': 'text-shadow/color',
      },
      styleNamesById: {
        'style-text-shadow': '4/title-shadow',
      },
    })

    const node = {
      type: 'TEXT',
      effectStyleId: 'style-text-shadow',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 1, y: 2 },
          radius: 3,
          color: { r: 0, g: 0, b: 0, a: 1 },
          boundVariables: {
            offsetX: { id: 'var-text-x' },
            offsetY: { id: 'var-text-y' },
            radius: { id: 'var-text-r' },
            color: { id: 'var-text-c' },
          },
        },
      ],
    } as unknown as TextNode

    expect(await getTextShadowProps(node)).toEqual({
      textShadow:
        '$textShadowX $textShadowY $textShadowRadius $textShadowColor',
      __textShadowToken: '$titleShadow',
    })
  })

  test('getTextShadowProps does not set __textShadowToken when style has no name', async () => {
    setupFigmaMocks({
      styleNamesById: {},
    })

    const node = {
      type: 'TEXT',
      effectStyleId: 'style-no-name',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 1, y: 2 },
          radius: 3,
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    } as unknown as TextNode

    const result = await getTextShadowProps(node)
    expect(result?.textShadow).toBe('1px 2px 3px #000')
    expect(result?.__textShadowToken).toBeUndefined()
  })

  test('getTextShadowProps does not set __textShadowToken when effectStyleId is empty', async () => {
    setupFigmaMocks()

    const node = {
      type: 'TEXT',
      effectStyleId: '',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 2, y: 4 },
          radius: 6,
          color: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    } as unknown as TextNode

    const result = await getTextShadowProps(node)
    expect(result?.textShadow).toBe('2px 4px 6px #000')
    expect(result?.__textShadowToken).toBeUndefined()
  })

  test('getTextShadowProps falls back to raw values when bound variable ids are unresolved', async () => {
    setupFigmaMocks()

    const node = {
      type: 'TEXT',
      effects: [
        {
          type: 'DROP_SHADOW',
          visible: true,
          offset: { x: 3, y: 6 },
          radius: 9,
          color: { r: 0.5, g: 0.25, b: 0.75, a: 1 },
          boundVariables: {
            offsetX: { id: 'unknown-x' },
            offsetY: { id: 'unknown-y' },
            radius: { id: 'unknown-r' },
            color: { id: 'unknown-c' },
          },
        },
      ],
    } as unknown as TextNode

    expect(await getTextShadowProps(node)).toEqual({
      textShadow: '3px 6px 9px #8040BF',
    })
  })
})
