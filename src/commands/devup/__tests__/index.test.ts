import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import * as downloadFileModule from '../../../utils/download-file'
import * as optimizeHexModule from '../../../utils/optimize-hex'
import * as rgbaToHexModule from '../../../utils/rgba-to-hex'
import * as styleNameToTypographyModule from '../../../utils/style-name-to-typography'
import * as textStyleToTypographyModule from '../../../utils/text-style-to-typography'
import * as uploadFileModule from '../../../utils/upload-file'
import { exportDevup, importDevup } from '../index'
import type { DevupTypography } from '../types'
import * as downloadXlsxModule from '../utils/download-devup-xlsx'
import * as getColorCollectionModule from '../utils/get-devup-color-collection'
import * as uploadXlsxModule from '../utils/upload-devup-xlsx'

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
    getColorCollectionSpy = null
    styleNameToTypographySpy = null
    textStyleToTypographySpy = null
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
})
