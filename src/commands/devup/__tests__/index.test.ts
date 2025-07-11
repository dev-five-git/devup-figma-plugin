import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as downloadFileModule from '../../../utils/download-file'
import * as uploadFileModule from '../../../utils/upload-file'
import { exportDevup, importDevup } from '../index'
import type { Devup } from '../types'
import * as colorUtils from '../utils/get-devup-color-collection'

describe('devup/index', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    ;(globalThis as any).figma = {
      variables: {
        getLocalVariableCollectionsAsync: vi.fn(),
        getVariableByIdAsync: vi.fn(),
        getLocalVariablesAsync: vi.fn(),
        createVariableCollection: vi.fn(),
        createVariable: vi.fn(),
      },
      util: {
        rgba: vi.fn((color: any) => color),
      },
      root: {
        children: [],
      },
      loadAllPagesAsync: vi.fn(),
      getLocalTextStylesAsync: vi.fn().mockResolvedValue([]),
      getStyleByIdAsync: vi.fn(),
      createTextStyle: vi.fn(),
      showUI: vi.fn(),
      ui: {
        onmessage: vi.fn(),
        postMessage: vi.fn(),
        close: vi.fn(),
      },
      base64Decode: vi.fn(),
      loadFontAsync: vi.fn().mockResolvedValue(undefined),
    } as any
  })

  it('should export devup', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue({
      name: 'Devup Colors',
      modes: [
        { name: 'Light', modeId: 'light' },
        { name: 'Dark', modeId: 'dark' },
      ],
      variableIds: ['var1'],
    } as any)
    ;(figma.variables.getVariableByIdAsync as any).mockImplementation(
      async (id: string) => {
        if (id === 'var1') {
          return {
            name: 'Primary',
            valuesByMode: {
              light: { r: 1, g: 0, b: 0, a: 1 },
              dark: { r: 0, g: 0, b: 0, a: 1 },
            },
          }
        }
        return null
      },
    )
    // downloadFile mock
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([
      { id: 'style1', name: 'mobile/Title' },
    ])
    ;(figma.root.children as any) = [
      {
        findAll: () => [
          {
            type: 'TEXT',
            textStyleId: 'style1',
            getStyledTextSegments: () => [
              {
                fontName: { family: 'Pretendard', style: 'Regular' },
                fontWeight: 700,
                fontSize: 20,
                textDecoration: 'NONE',
                textCase: 'ORIGINAL',
                lineHeight: { unit: 'PIXELS', value: 24 },
                letterSpacing: { unit: 'PIXELS', value: 0 },
              },
            ],
          },
        ],
      },
    ]
    ;(figma.getStyleByIdAsync as any).mockResolvedValue({
      id: 'style1',
      name: 'mobile/Title',
    })

    await exportDevup()
    expect(downloadFileMock).toHaveBeenCalled()
    const [fileName, data] = downloadFileMock.mock.calls[0]
    expect(fileName).toBe('devup.json')
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    ) as Devup
    expect(parsed.theme?.colors?.light?.primary).toBe('#FF0000')
    expect(parsed.theme?.colors?.dark?.primary).toBe('#000000')
    expect(parsed.theme?.typography?.title).toBeTruthy()
  })

  it('should import devup', async () => {
    // uploadFile mock
    const devupData: Devup = {
      theme: {
        colors: {
          Light: { primary: '#FF0000' },
        },
        typography: {
          title: {
            fontFamily: 'Pretendard',
            fontStyle: 'normal',
            fontSize: '20px',
            fontWeight: 700,
            lineHeight: '24px',
            letterSpacing: '0px',
          },
        },
      },
    }
    vi.spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify(devupData),
    )
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue({
      name: 'Devup Colors',
      modes: [{ name: 'Light', modeId: 'light' }],
      addMode: vi.fn((name: string) => name + '_id'),
      variableIds: [],
      removeMode: vi.fn(),
    } as any)
    ;(figma.variables.getLocalVariablesAsync as any).mockResolvedValue([])
    ;(figma.variables.createVariable as any).mockImplementation(
      (name: string) =>
        ({
          name,
          setValueForMode: vi.fn(),
        }) as any,
    )
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([])
    ;(figma.createTextStyle as any).mockReturnValue({ name: '' })
    await importDevup()
    expect(figma.variables.createVariable).toHaveBeenCalledWith(
      'primary',
      expect.anything(),
      'COLOR',
    )
    expect(figma.createTextStyle).toHaveBeenCalled()
  })

  it('should not create colors when color collection is not found', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue(null)
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    expect(downloadFileMock).toHaveBeenCalled()
    const [_, data] = downloadFileMock.mock.calls[0]
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    )
    expect(parsed.theme?.colors).toBeUndefined()
  })

  it('should not add colors when variable is null', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue({
      name: 'Devup Colors',
      modes: [{ name: 'Light', modeId: 'light' }],
      variableIds: ['var1'],
    } as any)
    ;(figma.variables.getVariableByIdAsync as any).mockResolvedValue(null)
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    const [_, data] = downloadFileMock.mock.calls[0]
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    )
    expect(parsed.theme?.colors?.light).toEqual({})
  })

  it('should not add colors when value is boolean/number', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue({
      name: 'Devup Colors',
      modes: [{ name: 'Light', modeId: 'light' }],
      variableIds: ['var1', 'var2'],
    } as any)
    ;(figma.variables.getVariableByIdAsync as any).mockImplementation(
      async (id: string) => {
        if (id === 'var1') return { name: 'A', valuesByMode: { light: true } }
        if (id === 'var2') return { name: 'B', valuesByMode: { light: 123 } }
        return null
      },
    )
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    const [_, data] = downloadFileMock.mock.calls[0]
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    )
    expect(parsed.theme?.colors?.light).toEqual({})
  })

  it('should not add colors when isVariableAlias is true and nextValue is null/boolean/number', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue({
      name: 'Devup Colors',
      modes: [{ name: 'Light', modeId: 'light' }],
      variableIds: ['var1', 'var2', 'var3'],
    } as any)
    // isVariableAlias mock
    vi.mock('../../utils/is-variable-alias', () => ({
      isVariableAlias: () => true,
    }))
    // variableAliasToValue mock
    const variableAliasToValue = await import(
      '../../../utils/variable-alias-to-value'
    )
    vi.spyOn(
      variableAliasToValue,
      'variableAliasToValue',
    ).mockResolvedValueOnce(null)
    vi.spyOn(
      variableAliasToValue,
      'variableAliasToValue',
    ).mockResolvedValueOnce(true)
    vi.spyOn(
      variableAliasToValue,
      'variableAliasToValue',
    ).mockResolvedValueOnce(123)
    ;(figma.variables.getVariableByIdAsync as any).mockImplementation(
      async (id: string) => {
        return {
          name: id,
          valuesByMode: { light: { type: 'VARIABLE_ALIAS', id: 'alias' } },
        }
      },
    )
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    const [_, data] = downloadFileMock.mock.calls[0]
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    )
    expect(parsed.theme?.colors?.light).toEqual({})
  })

  it('should not add typography when text.textStyleId is not string', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue(null)
    ;(figma.root.children as any) = [
      { findAll: () => [{ type: 'TEXT', textStyleId: 123 }] },
    ]
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([])
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    const [_, data] = downloadFileMock.mock.calls[0]
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    )
    expect(parsed.theme?.typography).toBeUndefined()
  })

  it('should not add typography when style is not found or ids is not found', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue(null)
    ;(figma.root.children as any) = [
      { findAll: () => [{ type: 'TEXT', textStyleId: 'style1' }] },
    ]
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([
      { id: 'style2', name: 'mobile/Title' },
    ])
    ;(figma.getStyleByIdAsync as any).mockResolvedValue(null)
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    const [_, data] = downloadFileMock.mock.calls[0]
    const parsed = JSON.parse(
      typeof data === 'string' ? data : Buffer.from(data).toString('utf-8'),
    )
    expect(parsed.theme?.typography).toBeUndefined()
  })

  it('should not add typography when typography[name] is already exists and value is already exists', async () => {
    vi.spyOn(colorUtils, 'getDevupColorCollection').mockResolvedValue(null)
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([
      { id: 'style1', name: 'mobile/Title' },
    ])
    ;(figma.root.children as any) = [
      {
        findAll: () => [
          {
            type: 'TEXT',
            textStyleId: 'style1',
            getStyledTextSegments: () => [
              {
                fontName: { family: 'Pretendard', style: 'Regular' },
                fontWeight: 700,
                fontSize: 20,
                textDecoration: 'NONE',
                textCase: 'ORIGINAL',
                lineHeight: { unit: 'PIXELS', value: 24 },
                letterSpacing: { unit: 'PIXELS', value: 0 },
              },
            ],
          },
        ],
      },
    ]
    ;(figma.getStyleByIdAsync as any).mockResolvedValue({
      id: 'style1',
      name: 'mobile/Title',
    })
    const downloadFileMock = vi
      .spyOn(downloadFileModule, 'downloadFile')
      .mockResolvedValue(undefined)
    await exportDevup()
    expect(downloadFileMock).toHaveBeenCalled()
  })

  it('should not do anything when devup.theme is not found', async () => {
    vi.spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify({}),
    )
    await importDevup()
    expect(figma.variables.createVariable).not.toHaveBeenCalled()
    expect(figma.createTextStyle).not.toHaveBeenCalled()
  })

  it('should not do anything when colors is not found', async () => {
    vi.spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify({ theme: {} }),
    )
    await importDevup()
    expect(figma.variables.createVariable).not.toHaveBeenCalled()
  })

  it('should not add typography when typography is array and v is falsy', async () => {
    vi.spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify({ theme: { typography: { title: [null, null, null] } } }),
    )
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([])
    await importDevup()
    expect(figma.createTextStyle).not.toHaveBeenCalled()
  })

  it('should cover letterSpacing, lineHeight, textTransform, textDecoration branches', async () => {
    vi.spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify({
        theme: {
          typography: {
            title: {
              fontFamily: 'Pretendard',
              fontStyle: 'italic',
              fontSize: '20px',
              fontWeight: 700,
              lineHeight: 'normal',
              letterSpacing: '1em',
              textTransform: 'uppercase',
              textDecoration: 'underline',
            },
          },
        },
      }),
    )
    ;(figma.getLocalTextStylesAsync as any).mockResolvedValue([])
    ;(figma.createTextStyle as any).mockReturnValue({ name: '' })
    await importDevup()
    expect(figma.createTextStyle).toHaveBeenCalled()
  })
})
