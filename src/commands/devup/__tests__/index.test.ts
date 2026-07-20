import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import * as downloadFileModule from '../../../utils/download-file'
import * as isVariableAliasModule from '../../../utils/is-variable-alias'
import * as optimizeHexModule from '../../../utils/optimize-hex'
import * as rgbaToHexModule from '../../../utils/rgba-to-hex'
import * as styleNameToTypographyModule from '../../../utils/style-name-to-typography'
import * as textSegmentToTypographyModule from '../../../utils/text-segment-to-typography'
import * as textStyleToTypographyModule from '../../../utils/text-style-to-typography'
import * as uploadFileModule from '../../../utils/upload-file'
import * as variableAliasToValueModule from '../../../utils/variable-alias-to-value'
import {
  buildDevupConfig,
  collectVariableSources,
  type DuplicateVariable,
  findDuplicateVariableNames,
  formatDuplicateReport,
  type VariableSource,
} from '../export-devup'
import { exportDevup, importDevup } from '../index'
import type { Devup, DevupTypography } from '../types'
import * as downloadXlsxModule from '../utils/download-devup-xlsx'
import * as getColorCollectionModule from '../utils/get-devup-color-collection'
import * as uploadXlsxModule from '../utils/upload-devup-xlsx'

afterAll(() => {
  mock.restore()
})

describe('devup commands', () => {
  const downloadFileMock = mock(() => Promise.resolve(undefined))
  const downloadXlsxMock = mock(() => Promise.resolve(undefined))
  const uploadFileMock = mock(() => Promise.resolve(''))
  const uploadXlsxMock = mock(() =>
    Promise.resolve({
      theme: { colors: {}, typography: {} },
    }),
  )
  let downloadFileSpy: ReturnType<typeof spyOn> | null = null
  let downloadXlsxSpy: ReturnType<typeof spyOn> | null = null
  let uploadFileSpy: ReturnType<typeof spyOn> | null = null
  let uploadXlsxSpy: ReturnType<typeof spyOn> | null = null
  let getColorCollectionSpy: ReturnType<typeof spyOn> | null = null
  let styleNameToTypographySpy: ReturnType<typeof spyOn> | null = null
  let textStyleToTypographySpy: ReturnType<typeof spyOn> | null = null
  let textSegmentToTypographySpy: ReturnType<typeof spyOn> | null = null
  let isVariableAliasSpy: ReturnType<typeof spyOn> | null = null
  let variableAliasToValueSpy: ReturnType<typeof spyOn> | null = null

  beforeEach(() => {
    downloadFileSpy = spyOn(
      downloadFileModule,
      'downloadFile',
    ).mockImplementation(downloadFileMock)
    downloadXlsxSpy = spyOn(
      downloadXlsxModule,
      'downloadDevupXlsx',
    ).mockImplementation(downloadXlsxMock)
    uploadFileSpy = spyOn(uploadFileModule, 'uploadFile').mockImplementation(
      uploadFileMock,
    )
    uploadXlsxSpy = spyOn(
      uploadXlsxModule,
      'uploadDevupXlsx',
    ).mockImplementation(uploadXlsxMock)
  })

  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
    downloadFileMock.mockClear()
    downloadXlsxMock.mockClear()
    uploadFileMock.mockClear()
    uploadXlsxMock.mockClear()
    downloadFileSpy?.mockRestore()
    downloadXlsxSpy?.mockRestore()
    uploadFileSpy?.mockRestore()
    uploadXlsxSpy?.mockRestore()
    getColorCollectionSpy?.mockRestore()
    styleNameToTypographySpy?.mockRestore()
    textStyleToTypographySpy?.mockRestore()
    textSegmentToTypographySpy?.mockRestore()
    isVariableAliasSpy?.mockRestore()
    variableAliasToValueSpy?.mockRestore()
    getColorCollectionSpy = null
    styleNameToTypographySpy = null
    textStyleToTypographySpy = null
    textSegmentToTypographySpy = null
    isVariableAliasSpy = null
    variableAliasToValueSpy = null
  })

  test('exportDevup exports colors and downloads json', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    )
    getColorCollectionSpy.mockResolvedValue({
      modes: [{ modeId: 'm1', name: 'Light' }],
      variableIds: ['v1'],
    } as unknown as VariableCollection)

    spyOn(rgbaToHexModule, 'rgbaToHex').mockReturnValue('#ff0000')
    spyOn(optimizeHexModule, 'optimizeHex').mockImplementation((v) => v)

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [] },
      variables: {
        getVariableByIdAsync: async () =>
          ({
            name: 'Primary',
            resolvedType: 'COLOR',
            valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
          }) as unknown as Variable,
        getLocalVariableCollectionsAsync: async () => [
          {
            modes: [{ modeId: 'm1', name: 'Light' }],
            variableIds: ['v1'],
          },
        ],
      },
    } as unknown as typeof figma

    await exportDevup('json')

    expect(downloadFileMock).toHaveBeenCalledWith(
      'devup.json',
      expect.stringContaining('"primary":"#ff0000"'),
    )
  })

  test('exportDevup treeshake false exports typography and downloads excel', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockReturnValue({
      level: 0,
      name: 'heading',
    })
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue({
      fontFamily: 'Inter',
    } as unknown as DevupTypography)

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () =>
        [
          { id: '1', name: 'heading/1' },
          { id: '2', name: 'heading/2' },
        ] as unknown as TextStyle[],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [] },
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('excel', false)

    expect(downloadXlsxMock).toHaveBeenCalledWith(
      'devup.xlsx',
      expect.stringContaining('"typography"'),
    )
  })

  test('exportDevup treeshake true handles variable aliases and segments', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue({
      modes: [{ modeId: 'm1', name: 'Light' }],
      variableIds: ['var1'],
    } as unknown as VariableCollection)
    isVariableAliasSpy = spyOn(
      isVariableAliasModule,
      'isVariableAlias',
    ).mockReturnValue(true)
    variableAliasToValueSpy = spyOn(
      variableAliasToValueModule,
      'variableAliasToValue',
    ).mockResolvedValue({ r: 1, g: 0, b: 0, a: 1 })
    spyOn(rgbaToHexModule, 'rgbaToHex').mockReturnValue('#ff0000')
    spyOn(optimizeHexModule, 'optimizeHex').mockImplementation((v) => v)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockReturnValue({ level: 0, name: 'heading' })
    const typoSeg = { fontFamily: 'Inter', fontSize: 12 }
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue(typoSeg as unknown as DevupTypography)
    textSegmentToTypographySpy = spyOn(
      textSegmentToTypographyModule,
      'textSegmentToTypography',
    ).mockReturnValue(typoSeg as unknown as DevupTypography)

    const textNode = {
      type: 'TEXT',
      textStyleId: 'style1',
      getStyledTextSegments: () => [{ textStyleId: 'style1' }],
    } as unknown as TextNode

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [
        { id: 'style1', name: 'heading/1' } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: {
        findAllWithCriteria: () => [textNode],
        children: [],
        findAll: () => [],
      },
      getStyleByIdAsync: async () =>
        ({ id: 'style1', name: 'heading/1' }) as unknown as TextStyle,
      mixed: Symbol('mixed'),
      variables: {
        getVariableByIdAsync: async () =>
          ({
            name: 'Primary',
            valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'var1' } },
          }) as unknown as Variable,
        getLocalVariableCollectionsAsync: async () => [
          {
            modes: [{ modeId: 'm1', name: 'Light' }],
            variableIds: ['var1'],
          },
        ],
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    expect(downloadFileMock).toHaveBeenCalledWith(
      'devup.json',
      expect.stringContaining('"typography"'),
    )
  })

  test('exportDevup treeshake true handles mixed-style text nodes', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockReturnValue({ level: 0, name: 'heading' })
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue({ fontFamily: 'Inter' } as unknown as DevupTypography)

    const mixedSymbol = Symbol('mixed')
    const mixedTextNode = {
      type: 'TEXT',
      textStyleId: mixedSymbol,
      getStyledTextSegments: () => [
        { textStyleId: 'style1' },
        { textStyleId: 'style2' },
      ],
    } as unknown as TextNode

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [
        { id: 'style1', name: 'heading/1' } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [mixedTextNode] },
      mixed: mixedSymbol,
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    expect(downloadFileMock).toHaveBeenCalledWith(
      'devup.json',
      expect.stringContaining('"typography"'),
    )
  })

  test('exportDevup treeshake true stops typography within current page subtree but loads all pages for bound vars', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockImplementation((name: string) =>
      name.includes('2')
        ? ({ level: 1, name: 'heading' } as const)
        : ({ level: 0, name: 'heading' } as const),
    )
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue({ fontFamily: 'Inter' } as unknown as DevupTypography)

    const currentTextNode = {
      type: 'TEXT',
      textStyleId: 'style1',
      getStyledTextSegments: () => [{ textStyleId: 'style1' }],
    } as unknown as TextNode
    const firstSectionFindAllWithCriteria = mock(() => [currentTextNode])
    const secondSectionFindAllWithCriteria = mock(() => [])
    const otherPageLoadAsync = mock(async () => {})
    const firstSection = {
      type: 'SECTION',
      findAllWithCriteria: firstSectionFindAllWithCriteria,
    } as unknown as SectionNode
    const secondSection = {
      type: 'SECTION',
      findAllWithCriteria: secondSectionFindAllWithCriteria,
    } as unknown as SectionNode
    const currentPage = {
      id: 'page-current',
      children: [firstSection, secondSection],
    } as unknown as PageNode
    const otherPage = {
      id: 'page-other',
      children: [],
      loadAsync: otherPageLoadAsync,
    } as unknown as PageNode

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      currentPage,
      getLocalTextStylesAsync: async () => [
        { id: 'style1', name: 'heading/1' } as unknown as TextStyle,
        { id: 'style2', name: 'heading/2' } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: {
        children: [otherPage, currentPage],
      },
      mixed: Symbol('mixed'),
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    expect(firstSectionFindAllWithCriteria).toHaveBeenCalledTimes(1)
    expect(secondSectionFindAllWithCriteria).not.toHaveBeenCalled()
    expect(otherPageLoadAsync).toHaveBeenCalledTimes(1)
    expect(downloadFileMock).toHaveBeenCalledWith(
      'devup.json',
      expect.stringContaining('"typography"'),
    )
  })

  test('exportDevup treeshake true lazily loads later pages when needed', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockImplementation((name: string) =>
      name.includes('2')
        ? ({ level: 1, name: 'body' } as const)
        : ({ level: 0, name: 'heading' } as const),
    )
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue({ fontFamily: 'Inter' } as unknown as DevupTypography)

    const currentSectionFindAllWithCriteria = mock(() => [])
    const otherTextNode = {
      type: 'TEXT',
      textStyleId: 'style2',
      getStyledTextSegments: () => [{ textStyleId: 'style2' }],
    } as unknown as TextNode
    const otherSectionFindAllWithCriteria = mock(() => [otherTextNode])
    const otherPageLoadAsync = mock(async () => {})
    const currentPage = {
      id: 'page-current',
      children: [
        {
          type: 'SECTION',
          findAllWithCriteria: currentSectionFindAllWithCriteria,
        } as unknown as SectionNode,
      ],
    } as unknown as PageNode
    const otherPage = {
      id: 'page-other',
      children: [
        {
          type: 'SECTION',
          findAllWithCriteria: otherSectionFindAllWithCriteria,
        } as unknown as SectionNode,
      ],
      loadAsync: otherPageLoadAsync,
    } as unknown as PageNode

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      currentPage,
      getLocalTextStylesAsync: async () => [
        { id: 'style1', name: 'heading/1' } as unknown as TextStyle,
        { id: 'style2', name: 'body/2' } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: {
        children: [currentPage, otherPage],
      },
      mixed: Symbol('mixed'),
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    expect(currentSectionFindAllWithCriteria).toHaveBeenCalledTimes(1)
    expect(otherPageLoadAsync).toHaveBeenCalledTimes(1)
    expect(otherSectionFindAllWithCriteria).toHaveBeenCalledTimes(1)
    expect(downloadFileMock).toHaveBeenCalledWith(
      'devup.json',
      expect.stringContaining('"typography"'),
    )
  })

  test('exportDevup treeshake true handles direct text children and recursive fallback nodes', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockImplementation((name: string) =>
      name.includes('2')
        ? ({ level: 1, name: 'body' } as const)
        : ({ level: 0, name: 'heading' } as const),
    )
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockImplementation(
      async (style: TextStyle) =>
        ({ id: style.id }) as unknown as DevupTypography,
    )

    const directTextNode = {
      type: 'TEXT',
      textStyleId: 'style1',
      getStyledTextSegments: () => [{ textStyleId: 'style1' }],
    } as unknown as TextNode
    const nestedTextNode = {
      type: 'TEXT',
      textStyleId: 'style2',
      getStyledTextSegments: () => [{ textStyleId: 'style2' }],
    } as unknown as TextNode
    const recursiveNode = {
      type: 'GROUP',
      children: [nestedTextNode],
    } as unknown as GroupNode
    const currentPage = {
      id: 'page-current',
      children: [directTextNode, recursiveNode],
    } as unknown as PageNode

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      currentPage,
      getLocalTextStylesAsync: async () => [
        { id: 'style1', name: 'heading/1' } as unknown as TextStyle,
        { id: 'style2', name: 'body/2' } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: {
        children: [currentPage],
      },
      mixed: Symbol('mixed'),
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    const firstCall = downloadFileMock.mock.calls[0] as unknown[] | undefined
    const data = (firstCall?.[1] as string) ?? '{}'
    const parsed = JSON.parse(data) as {
      theme?: { typography?: Record<string, unknown> }
    }
    expect(parsed.theme?.typography?.heading).toBeDefined()
    expect(parsed.theme?.typography?.body).toBeDefined()
  })

  test('exportDevup fills missing typography levels from styles map', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockImplementation((name: string) =>
      name.includes('2')
        ? ({ level: 1, name: 'heading' } as const)
        : ({ level: 0, name: 'heading' } as const),
    )
    const typoSeg = { fontFamily: 'Inter', fontSize: 12 }
    textSegmentToTypographySpy = spyOn(
      textSegmentToTypographyModule,
      'textSegmentToTypography',
    ).mockReturnValue(typoSeg as unknown as DevupTypography)
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue(typoSeg as unknown as DevupTypography)

    const textNode = {
      type: 'TEXT',
      textStyleId: 'style1',
      getStyledTextSegments: () => [{ textStyleId: 'style1' }],
    } as unknown as TextNode

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () =>
        [
          { id: 'style1', name: 'heading/1' },
          { id: 'style2', name: 'heading/2' },
        ] as unknown as TextStyle[],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [textNode], children: [] },
      getStyleByIdAsync: async (id: string) =>
        id === 'style1'
          ? ({ id: 'style1', name: 'heading/1' } as unknown as TextStyle)
          : ({ id: 'style2', name: 'heading/2' } as unknown as TextStyle),
      mixed: Symbol('mixed'),
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    const firstCall = downloadFileMock.mock.calls[0] as unknown[] | undefined
    const data = (firstCall?.[1] as string) ?? '{}'
    const parsed = JSON.parse(data) as {
      theme?: { typography?: Record<string, unknown> }
    }
    expect(parsed.theme?.typography?.heading).toBeDefined()
  })

  test('exportDevup builds typography array when first level missing', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockImplementation((name: string) =>
      name.includes('3')
        ? ({ level: 3, name: 'heading' } as const)
        : ({ level: 1, name: 'heading' } as const),
    )
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockImplementation(
      async (style: TextStyle) =>
        ({ id: style.id }) as unknown as DevupTypography,
    )

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () =>
        [
          { id: 'style1', name: 'heading/1' },
          { id: 'style3', name: 'heading/3' },
        ] as unknown as TextStyle[],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', false)

    const firstCall = downloadFileMock.mock.calls[0] as unknown[] | undefined
    const data = (firstCall?.[1] as string) ?? '{}'
    const parsed = JSON.parse(data) as {
      theme?: { typography?: Record<string, unknown> }
    }
    expect(parsed.theme?.typography?.heading).toBeDefined()
  })

  test('exportDevup keeps full array when first level exists', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockImplementation((name: string) =>
      name.includes('2')
        ? ({ level: 1, name: 'heading' } as const)
        : ({ level: 0, name: 'heading' } as const),
    )
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockImplementation(
      async (style: TextStyle) =>
        ({ id: style.id }) as unknown as DevupTypography,
    )

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () =>
        [
          { id: 'style0', name: 'heading/0' },
          { id: 'style1', name: 'heading/2' },
        ] as unknown as TextStyle[],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
    } as unknown as typeof figma

    await exportDevup('json', false)

    const firstCall = downloadFileMock.mock.calls[0] as unknown[] | undefined
    const data = (firstCall?.[1] as string) ?? '{}'
    const parsed = JSON.parse(data) as {
      theme?: { typography?: Record<string, unknown> }
    }
    expect(Array.isArray(parsed.theme?.typography?.heading)).toBe(true)
  })

  test('exportDevup filters out empty typography entries', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockReturnValue({ level: 0, name: 'heading' })
    textSegmentToTypographySpy = spyOn(
      textSegmentToTypographyModule,
      'textSegmentToTypography',
    ).mockReturnValue(null as unknown as DevupTypography)

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [
        {
          id: 'id',
          name: 'heading/1',
          fontName: { family: 'Inter', style: 'Regular' },
        } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: {
        findAllWithCriteria: () => [
          {
            textStyleId: 'id',
            getStyledTextSegments: () => [{ textStyleId: 'id' }],
          } as unknown as TextNode,
        ],
      },
      getStyleByIdAsync: async () =>
        ({
          id: 'id',
          name: 'heading/1',
          fontName: { family: 'Inter', style: 'Regular' },
        }) as unknown as TextStyle,
    } as unknown as typeof figma

    await exportDevup('json')

    const payload = JSON.parse(
      (downloadFileMock.mock.calls[0] as unknown as { args: [string, string] })
        ?.args?.[1] ?? '{}',
    )
    expect(payload.theme?.typography).toBeUndefined()
  })

  test('exportDevup notifies and skips json download when variable names collide across collections', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    spyOn(rgbaToHexModule, 'rgbaToHex').mockReturnValue('#ff0000')
    spyOn(optimizeHexModule, 'optimizeHex').mockImplementation((v) => v)

    const colorVariable = {
      name: 'title',
      resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
    } as unknown as Variable
    const floatVariable = {
      name: 'title',
      resolvedType: 'FLOAT',
      valuesByMode: { m1: 16 },
    } as unknown as Variable
    const variablesById: Record<string, Variable> = {
      color1: colorVariable,
      float1: floatVariable,
    }

    const notifyMock = mock(() => {})
    const consoleErrorMock = spyOn(console, 'error').mockImplementation(
      () => {},
    )
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
      variables: {
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getLocalVariableCollectionsAsync: async () => [
          {
            name: 'Brand',
            modes: [{ modeId: 'm1', name: 'Light' }],
            variableIds: ['color1', 'float1'],
          },
        ],
      },
      notify: notifyMock,
    } as unknown as typeof figma

    await exportDevup('json', false)

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const [message, options] = notifyMock.mock.calls[0] as unknown as [
      string,
      { error?: boolean; timeout?: number },
    ]
    expect(message).toContain('"title"')
    expect(message).toContain('colors')
    expect(message).toContain('length')
    expect(options).toMatchObject({ error: true })
    expect(downloadFileMock).not.toHaveBeenCalled()

    // Console report pinpoints the exact collection + original name to rename.
    expect(consoleErrorMock).toHaveBeenCalledTimes(1)
    const [report] = consoleErrorMock.mock.calls[0] as unknown as [string]
    expect(report).toContain('"title"')
    expect(report).toContain(
      'colors: color variable "title" in collection "Brand"',
    )
    expect(report).toContain(
      'length: number (float) variable "title" in collection "Brand"',
    )
    consoleErrorMock.mockRestore()
  })

  test('exportDevup notifies and skips excel download when variable names collide across collections', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)
    spyOn(rgbaToHexModule, 'rgbaToHex').mockReturnValue('#ff0000')
    spyOn(optimizeHexModule, 'optimizeHex').mockImplementation((v) => v)
    styleNameToTypographySpy = spyOn(
      styleNameToTypographyModule,
      'styleNameToTypography',
    ).mockReturnValue({ level: 0, name: 'title' })
    textStyleToTypographySpy = spyOn(
      textStyleToTypographyModule,
      'textStyleToTypography',
    ).mockResolvedValue({ fontFamily: 'Inter' } as unknown as DevupTypography)

    const colorVariable = {
      name: 'title',
      resolvedType: 'COLOR',
      valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
    } as unknown as Variable
    const variablesById: Record<string, Variable> = { color1: colorVariable }

    const notifyMock = mock(() => {})
    const consoleErrorMock = spyOn(console, 'error').mockImplementation(
      () => {},
    )
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [
        { id: 'style1', name: 'title' } as unknown as TextStyle,
      ],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
      variables: {
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getLocalVariableCollectionsAsync: async () => [
          {
            name: 'Brand',
            modes: [{ modeId: 'm1', name: 'Light' }],
            variableIds: ['color1'],
          },
        ],
      },
      notify: notifyMock,
    } as unknown as typeof figma

    await exportDevup('excel', false)

    expect(notifyMock).toHaveBeenCalledTimes(1)
    const [message] = notifyMock.mock.calls[0] as unknown as [string]
    expect(message).toContain('"title"')
    expect(message).toContain('colors')
    expect(message).toContain('typography')
    expect(downloadXlsxMock).not.toHaveBeenCalled()

    // colors resolves to the exact variable; typography is style-backed (no collection).
    expect(consoleErrorMock).toHaveBeenCalledTimes(1)
    const [report] = consoleErrorMock.mock.calls[0] as unknown as [string]
    expect(report).toContain(
      'colors: color variable "title" in collection "Brand"',
    )
    expect(report).toContain('typography: text style')
    consoleErrorMock.mockRestore()
  })

  test('importDevup creates colors and typography from json', async () => {
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(null)

    uploadFileMock.mockResolvedValue(
      JSON.stringify({
        theme: {
          colors: { Light: { primary: '#112233' } },
          typography: {
            heading: {
              fontFamily: 'Inter',
              fontSize: '16',
              letterSpacing: '0.1em',
              lineHeight: 'normal',
              textTransform: 'uppercase',
              textDecoration: 'underline',
            },
          },
        },
      }),
    )

    const setValueForMode = mock(() => {})
    const removeMode = mock(() => {})
    const removeVariable = mock(() => {})
    const createVariable = mock(
      () =>
        ({
          name: 'primary',
          setValueForMode,
          remove: removeVariable,
        }) as unknown as Variable,
    )

    const createdCollection = {
      modes: [] as { modeId: string; name: string }[],
      addMode: (name: string) => {
        const id = `${name}-id`
        createdCollection.modes.push({ modeId: id, name })
        return id
      },
      removeMode,
    } as unknown as VariableCollection

    const createTextStyleMock = mock(
      () =>
        ({
          name: '',
        }) as unknown as TextStyle,
    )

    const loadFontAsync = mock(() => Promise.resolve())
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () => createdCollection,
        getLocalVariablesAsync: async () => [],
        createVariable,
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      createTextStyle: createTextStyleMock,
      loadFontAsync,
    } as unknown as typeof figma

    await importDevup('json')

    expect(getColorCollectionSpy).toHaveBeenCalled()
    expect(createdCollection.modes[0]?.name).toBe('Light')
    expect(createVariable).toHaveBeenCalledWith(
      'primary',
      createdCollection,
      'COLOR',
    )
    expect(setValueForMode).toHaveBeenCalledWith('Light-id', '#112233')
    expect(createTextStyleMock).toHaveBeenCalled()
    expect(loadFontAsync).toHaveBeenCalled()
  })

  test('importDevup handles excel input with modes and removal', async () => {
    const addModeMock = mock((name: string) => `${name}-id`)
    getColorCollectionSpy = spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue({
      modes: [{ modeId: 'existing', name: 'Old' }],
      removeMode: mock(() => {}),
      addMode: addModeMock,
    } as unknown as VariableCollection)

    uploadXlsxMock.mockResolvedValue({
      theme: {
        colors: { Light: { primary: '#111111' } },
        typography: {
          title: [
            {
              fontFamily: 'Inter',
              fontStyle: 'italic',
              fontSize: '18',
              letterSpacing: '0.2em',
              lineHeight: 120,
              textTransform: 'lowercase',
              textDecoration: 'line-through',
            },
            null,
          ],
        },
      },
    })

    const setValueForMode = mock(() => {})
    const remove = mock(() => {})
    const variable = {
      name: 'unused',
      setValueForMode,
      remove,
    } as unknown as Variable

    const collection = {
      modes: [{ modeId: 'existing', name: 'Old' }],
      addMode: mock(() => 'Light-id'),
      removeMode: mock(() => {}),
    } as unknown as VariableCollection

    const createVariable = mock(
      () =>
        ({
          name: 'primary',
          setValueForMode,
          remove,
        }) as unknown as Variable,
    )

    const createTextStyleMock = mock(
      () =>
        ({
          name: '',
        }) as unknown as TextStyle,
    )

    const loadFontAsync = mock(() => Promise.resolve())

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () => collection,
        getLocalVariablesAsync: async () => [variable],
        createVariable,
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      createTextStyle: createTextStyleMock,
      loadFontAsync,
    } as unknown as typeof figma

    await importDevup('excel')

    expect(addModeMock).toHaveBeenCalledWith('Light')
    expect(setValueForMode).toHaveBeenCalledWith('Light-id', '#111111')
    expect(remove).toHaveBeenCalled()
    expect(createTextStyleMock).toHaveBeenCalled()
  })

  test('importDevup notifies when font load fails and covers letterSpacing/lineHeight', async () => {
    uploadFileMock.mockResolvedValue(
      JSON.stringify({
        theme: {
          typography: {
            title: {
              fontFamily: 'Inter',
              fontStyle: 'italic',
              fontSize: '18',
              letterSpacing: '2px',
              lineHeight: '20',
              textTransform: 'uppercase',
              textDecoration: 'underline',
            },
          },
        },
      }),
    )

    const notifyMock = mock(() => {})
    const createTextStyleMock = mock(
      () =>
        ({
          name: '',
        }) as unknown as TextStyle,
    )
    const loadFontAsync = mock(() => Promise.reject('font'))
    spyOn(console, 'error').mockImplementation(() => {})

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () =>
          ({
            modes: [],
            addMode: () => 'm1',
            removeMode: () => {},
          }) as unknown as VariableCollection,
        getLocalVariablesAsync: async () => [],
        createVariable: () =>
          ({
            setValueForMode: () => {},
            remove: () => {},
          }) as unknown as Variable,
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      createTextStyle: createTextStyleMock,
      loadFontAsync,
      notify: notifyMock,
    } as unknown as typeof figma

    await importDevup('json')

    expect(notifyMock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create text style'),
      expect.any(Object),
    )
    expect(console.error).toHaveBeenCalledWith(
      'Failed to create text style',
      'font',
    )
  })

  test('importDevup sets typography spacing values', async () => {
    uploadFileMock.mockResolvedValue(
      JSON.stringify({
        theme: {
          typography: {
            body: {
              fontFamily: 'Inter',
              fontStyle: 'normal',
              fontSize: '14',
              letterSpacing: '1px',
              lineHeight: '18',
            },
          },
        },
      }),
    )

    const createTextStyleMock = mock(
      () =>
        ({
          name: '',
        }) as unknown as TextStyle,
    )
    const loadFontAsync = mock(() => Promise.resolve())

    const styleObj = createTextStyleMock() as TextStyle & {
      letterSpacing?: LetterSpacing
      lineHeight?: LineHeight
      textCase?: TextCase
      textDecoration?: TextDecoration
      fontSize?: number
      fontName?: FontName
    }

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () =>
          ({
            modes: [],
            addMode: () => 'm1',
            removeMode: () => {},
          }) as unknown as VariableCollection,
        getLocalVariablesAsync: async () => [],
        createVariable: () =>
          ({
            setValueForMode: () => {},
            remove: () => {},
          }) as unknown as Variable,
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      createTextStyle: () => styleObj,
      loadFontAsync,
      notify: mock(() => {}),
    } as unknown as typeof figma

    await importDevup('json')

    expect(styleObj.letterSpacing).toMatchObject({ unit: 'PIXELS', value: 100 })
    expect(styleObj.lineHeight).toMatchObject({ unit: 'PIXELS', value: 18 })
  })
})

describe('findDuplicateVariableNames', () => {
  test('returns empty map when no theme is defined', () => {
    expect(findDuplicateVariableNames({}).size).toBe(0)
  })

  test('returns empty map when each name lives in a single category', () => {
    const devup: Devup = {
      theme: {
        colors: { light: { primary: '#fff' }, dark: { primary: '#000' } },
        length: { default: { gutter: '16px' } },
        shadows: { default: { card: '0 0 1px #000' } },
        typography: { heading: { fontFamily: 'Inter' } },
      },
    }
    expect(findDuplicateVariableNames(devup).size).toBe(0)
  })

  test('reports a name shared between colors and length', () => {
    const devup: Devup = {
      theme: {
        colors: { light: { title: '#fff' } },
        length: { default: { title: '16px' } },
      },
    }
    const duplicates = findDuplicateVariableNames(devup)
    expect(duplicates.get('title')?.categories).toEqual(['colors', 'length'])
    // No source index passed → sources default to empty.
    expect(duplicates.get('title')?.sources).toEqual([])
  })

  test('reports a name shared between typography and shadows', () => {
    const devup: Devup = {
      theme: {
        shadows: { default: { card: '0 0 1px #000' } },
        typography: { card: { fontFamily: 'Inter' } },
      },
    }
    const duplicates = findDuplicateVariableNames(devup)
    expect(duplicates.get('card')?.categories).toEqual([
      'shadows',
      'typography',
    ])
  })

  test('reports a name occurring in three categories', () => {
    const devup: Devup = {
      theme: {
        colors: { light: { brand: '#fff' } },
        length: { default: { brand: '16px' } },
        typography: { brand: { fontFamily: 'Inter' } },
      },
    }
    const duplicates = findDuplicateVariableNames(devup)
    expect(duplicates.get('brand')?.categories).toEqual([
      'colors',
      'length',
      'typography',
    ])
  })

  test('deduplicates a name appearing in multiple themes of the same category', () => {
    const devup: Devup = {
      theme: {
        colors: {
          light: { title: '#fff' },
          dark: { title: '#000' },
        },
      },
    }
    // Same category — not a cross-collection duplicate.
    expect(findDuplicateVariableNames(devup).size).toBe(0)
  })

  test('annotates duplicates with variable sources when provided', () => {
    const devup: Devup = {
      theme: {
        colors: { light: { title: '#fff' } },
        length: { default: { title: '16px' } },
        shadows: { default: { card: '0 0 1px #000' } },
        typography: { card: { fontFamily: 'Inter' } },
      },
    }
    const sources = new Map<string, VariableSource[]>([
      [
        'title',
        [
          { collection: 'Brand', originalName: 'Title', category: 'colors' },
          { collection: 'Spacing', originalName: 'title', category: 'length' },
        ],
      ],
    ])
    const duplicates = findDuplicateVariableNames(devup, sources)
    expect(duplicates.get('title')?.sources).toEqual([
      { collection: 'Brand', originalName: 'Title', category: 'colors' },
      { collection: 'Spacing', originalName: 'title', category: 'length' },
    ])
    // 'card' is style-backed and absent from the source index → empty sources.
    expect(duplicates.get('card')?.categories).toEqual([
      'shadows',
      'typography',
    ])
    expect(duplicates.get('card')?.sources).toEqual([])
  })
})

describe('collectVariableSources', () => {
  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  test('indexes COLOR and FLOAT variables by camelCased name with collection + origin', async () => {
    const variablesById: Record<string, Variable> = {
      c1: { name: 'Title Color', resolvedType: 'COLOR' } as unknown as Variable,
      f1: { name: 'title-color', resolvedType: 'FLOAT' } as unknown as Variable,
      s1: { name: 'ignored', resolvedType: 'STRING' } as unknown as Variable,
    }
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getLocalVariableCollectionsAsync: async () => [
          { name: 'Colors', variableIds: ['c1', 's1'] },
          { name: 'Spacing', variableIds: ['f1', 'missing'] },
        ],
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
      },
      root: { children: [] },
    } as unknown as typeof figma

    const index = await collectVariableSources()
    // 'Title Color' and 'title-color' both camelCase to 'titleColor'.
    expect(index.get('titleColor')).toEqual([
      { collection: 'Colors', originalName: 'Title Color', category: 'colors' },
      {
        collection: 'Spacing',
        originalName: 'title-color',
        category: 'length',
      },
    ])
    // STRING variables map to no Devup category → ignored.
    expect(index.get('ignored')).toBeUndefined()
  })

  test('locates library/bound variables that are absent from local collections', async () => {
    const localColor = {
      name: 'caption',
      resolvedType: 'COLOR',
    } as unknown as Variable
    const remoteFloat = {
      name: 'caption',
      resolvedType: 'FLOAT',
      remote: true,
      variableCollectionId: 'coll-remote',
    } as unknown as Variable
    const variablesById: Record<string, Variable> = {
      'local-color': localColor,
      'remote-float': remoteFloat,
    }
    const page = {
      id: 'page-1',
      children: [
        {
          id: 'frame-1',
          name: 'Card / Padding',
          type: 'FRAME',
          boundVariables: { paddingLeft: { id: 'remote-float' } },
          children: [],
        },
      ],
    }
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getLocalVariableCollectionsAsync: async () => [
          { name: 'Semantic', variableIds: ['local-color'] },
        ],
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getVariableCollectionByIdAsync: async (id: string) =>
          id === 'coll-remote' ? { name: 'Spacing (library)' } : null,
      },
      skipInvisibleInstanceChildren: false,
      currentPage: page,
      root: { children: [page] },
    } as unknown as typeof figma

    const index = await collectVariableSources()
    // The FLOAT "caption" is invisible in local collections but bound in the
    // document → surfaced with its library flag + the node that binds it.
    expect(index.get('caption')).toEqual([
      { collection: 'Semantic', originalName: 'caption', category: 'colors' },
      {
        collection: 'Spacing (library)',
        originalName: 'caption',
        category: 'length',
        remote: true,
        boundNodeName: 'Card / Padding',
      },
    ])
  })
})

describe('formatDuplicateReport', () => {
  test('shows collection + origin for variable-backed categories and a hint otherwise', () => {
    const duplicates = new Map<string, DuplicateVariable>([
      [
        'caption',
        {
          categories: ['colors', 'length'],
          sources: [
            {
              collection: 'Semantic',
              originalName: 'Caption',
              category: 'colors',
            },
            {
              collection: 'Spacing',
              originalName: 'caption',
              category: 'length',
              remote: true,
              boundNodeName: 'Card / Padding',
            },
          ],
        },
      ],
      ['card', { categories: ['shadows', 'typography'], sources: [] }],
    ])
    const report = formatDuplicateReport(duplicates)
    expect(report).toContain('- "caption" spans 2 categories:')
    expect(report).toContain(
      'colors: color variable "Caption" in collection "Semantic"',
    )
    // Library + bound-node annotations pinpoint the otherwise-invisible source.
    expect(report).toContain(
      'length: number (float) variable "caption" in collection "Spacing" (library, bound on node "Card / Padding")',
    )
    // Style-backed categories have no variable source → generic hint only.
    expect(report).toContain('shadows: effect style')
    expect(report).toContain('typography: text style')
  })
})

describe('buildDevupConfig', () => {
  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  test('excludes remote/library bound variables from length (only current-file collections)', async () => {
    const localFloat = {
      name: 'gutter',
      resolvedType: 'FLOAT',
      remote: false,
      variableCollectionId: 'local-coll',
      valuesByMode: { m1: 16 },
    } as unknown as Variable
    // Tag-along library variable — bound to a pasted node, not registered locally.
    const remoteFloat = {
      name: 'caption',
      resolvedType: 'FLOAT',
      remote: true,
      variableCollectionId: 'remote-coll',
      valuesByMode: { m1: 12 },
    } as unknown as Variable
    const variablesById: Record<string, Variable> = {
      'local-float': localFloat,
      'remote-float': remoteFloat,
    }
    const collectionsById: Record<string, VariableCollection> = {
      'local-coll': {
        id: 'local-coll',
        name: 'Sizes',
        modes: [{ modeId: 'm1', name: 'mobile' }],
      } as unknown as VariableCollection,
      'remote-coll': {
        id: 'remote-coll',
        name: '수치',
        modes: [{ modeId: 'm1', name: 'mobile' }],
      } as unknown as VariableCollection,
    }
    const page = {
      id: 'p1',
      children: [
        {
          id: 'n1',
          name: 'Frame',
          type: 'FRAME',
          boundVariables: {
            paddingLeft: { id: 'local-float' },
            paddingRight: { id: 'remote-float' },
          },
          children: [],
        },
      ],
    }
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      mixed: Symbol('mixed'),
      skipInvisibleInstanceChildren: false,
      currentPage: page,
      root: { children: [page] },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      variables: {
        getLocalVariableCollectionsAsync: async () => [
          {
            id: 'local-coll',
            name: 'Sizes',
            variableIds: [],
            modes: [{ modeId: 'm1', name: 'mobile' }],
          },
        ],
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getVariableCollectionByIdAsync: async (id: string) =>
          collectionsById[id] ?? null,
      },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(true)
    const defaultLength = devup.theme?.length?.default ?? {}
    // Local FLOAT stays; the library/remote FLOAT that tagged along is dropped.
    expect(Object.keys(defaultLength)).toContain('gutter')
    expect(Object.keys(defaultLength)).not.toContain('caption')
  })
})
