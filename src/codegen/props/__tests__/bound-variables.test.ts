import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { resetVariableCache } from '../../utils/variable-cache'
import { getAutoLayoutProps } from '../auto-layout'
import { getBorderRadiusProps } from '../border'
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
})
