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
import { exportDevup, importDevup } from '../index'
import type { DevupTypography } from '../types'
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
      root: { findAllWithCriteria: () => [] },
      variables: {
        getVariableByIdAsync: async () =>
          ({
            name: 'Primary',
            valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } },
          }) as unknown as Variable,
      },
    } as unknown as typeof figma

    await exportDevup('json')

    expect(getColorCollectionSpy).toHaveBeenCalled()
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
    ).mockReturnValue({
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
      root: { findAllWithCriteria: () => [] },
      variables: {
        getVariableByIdAsync: async () => null,
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
    ).mockReturnValue(typoSeg as unknown as DevupTypography)
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
      },
    } as unknown as typeof figma

    await exportDevup('json', true)

    expect(downloadFileMock).toHaveBeenCalledWith(
      'devup.json',
      expect.stringContaining('"typography"'),
    )
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
    ).mockReturnValue(typoSeg as unknown as DevupTypography)

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
      root: { findAllWithCriteria: () => [textNode], children: [] },
      getStyleByIdAsync: async (id: string) =>
        id === 'style1'
          ? ({ id: 'style1', name: 'heading/1' } as unknown as TextStyle)
          : ({ id: 'style2', name: 'heading/2' } as unknown as TextStyle),
      mixed: Symbol('mixed'),
      variables: { getVariableByIdAsync: async () => null },
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
      (style: TextStyle) => ({ id: style.id }) as unknown as DevupTypography,
    )

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () =>
        [
          { id: 'style1', name: 'heading/1' },
          { id: 'style3', name: 'heading/3' },
        ] as unknown as TextStyle[],
      root: { findAllWithCriteria: () => [], children: [] },
      variables: { getVariableByIdAsync: async () => null },
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
      (style: TextStyle) => ({ id: style.id }) as unknown as DevupTypography,
    )

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () =>
        [
          { id: 'style0', name: 'heading/0' },
          { id: 'style1', name: 'heading/2' },
        ] as unknown as TextStyle[],
      root: { findAllWithCriteria: () => [], children: [] },
      variables: { getVariableByIdAsync: async () => null },
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
      variables: {},
      loadAllPagesAsync: async () => {},
      getLocalTextStylesAsync: async () => [
        {
          id: 'id',
          name: 'heading/1',
          fontName: { family: 'Inter', style: 'Regular' },
        } as unknown as TextStyle,
      ],
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
      createTextStyle: () => styleObj,
      loadFontAsync,
      notify: mock(() => {}),
    } as unknown as typeof figma

    await importDevup('json')

    expect(styleObj.letterSpacing).toMatchObject({ unit: 'PIXELS', value: 100 })
    expect(styleObj.lineHeight).toMatchObject({ unit: 'PIXELS', value: 18 })
  })
})
