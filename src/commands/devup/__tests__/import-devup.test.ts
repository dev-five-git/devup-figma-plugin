import { describe, expect, mock, spyOn, test } from 'bun:test'
import * as uploadFileModule from '../../../utils/upload-file'
import { importDevup } from '../import-devup'
import * as uploadXlsxModule from '../utils/upload-devup-xlsx'

describe('import-devup (standalone file)', () => {
  test('returns early when theme is missing', async () => {
    const uploadFile = mock(() => Promise.resolve('{}'))
    spyOn(uploadFileModule, 'uploadFile').mockImplementation(uploadFile)
    await importDevup('json')
    expect(uploadFile).toHaveBeenCalledWith('.json')
  })

  test('imports colors and typography from excel payload', async () => {
    const uploadXlsx = mock(() =>
      Promise.resolve({
        theme: {
          colors: { Light: { primary: '#111111' } },
          typography: {
            heading: {
              fontFamily: 'Inter',
              fontStyle: 'italic',
              fontSize: '12',
              letterSpacing: '0.1em',
              lineHeight: 'normal',
              textTransform: 'uppercase',
              textDecoration: 'underline',
            },
          },
        },
      }),
    )
    spyOn(uploadXlsxModule, 'uploadDevupXlsx').mockImplementation(uploadXlsx)

    const setValueForMode = mock(() => {})
    const createVariable = mock(
      () =>
        ({
          name: 'primary',
          setValueForMode,
          remove: mock(() => {}),
        }) as unknown as Variable,
    )
    const addMode = mock((name: string) => `${name}-id`)
    const collection = {
      modes: [] as { modeId: string; name: string }[],
      addMode,
      removeMode: mock(() => {}),
    } as unknown as VariableCollection

    const createTextStyle = mock(
      () =>
        ({
          name: '',
        }) as unknown as TextStyle,
    )
    const loadFontAsync = mock(() => Promise.resolve())

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        getLocalVariablesAsync: async () => [],
        createVariableCollection: () => collection,
        createVariable,
      },
      getLocalTextStylesAsync: async () => [],
      createTextStyle,
      loadFontAsync,
    } as unknown as typeof figma

    await importDevup('excel')

    expect(addMode).toHaveBeenCalledWith('Light')
    expect(setValueForMode).toHaveBeenCalledWith('Light-id', '#111111')
    expect(createTextStyle).toHaveBeenCalled()
    expect(loadFontAsync).toHaveBeenCalled()
  })

  test('imports array typography and skips nulls', async () => {
    const uploadXlsx = mock(() =>
      Promise.resolve({
        theme: {
          typography: {
            title: [
              null,
              {
                fontFamily: 'Inter',
                fontSize: '14',
                letterSpacing: '1',
                lineHeight: 120,
              },
            ],
          },
        },
      }),
    )
    spyOn(uploadXlsxModule, 'uploadDevupXlsx').mockImplementation(uploadXlsx)

    const createTextStyle = mock(
      () =>
        ({
          name: '',
        }) as unknown as TextStyle,
    )
    const loadFontAsync = mock(() => Promise.resolve())

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        getLocalVariablesAsync: async () => [],
        createVariableCollection: () =>
          ({
            modes: [],
            addMode: mock(() => 'm1'),
            removeMode: mock(() => {}),
          }) as unknown as VariableCollection,
        createVariable: mock(
          () =>
            ({
              name: 'primary',
              setValueForMode: mock(() => {}),
              remove: mock(() => {}),
            }) as unknown as Variable,
        ),
      },
      getLocalTextStylesAsync: async () => [],
      createTextStyle,
      loadFontAsync,
    } as unknown as typeof figma

    await importDevup('excel')

    expect(createTextStyle).toHaveBeenCalled()
    expect(loadFontAsync).toHaveBeenCalled()
  })
})
