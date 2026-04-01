import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import * as uploadFileModule from '../../../utils/upload-file'
import { importDevup } from '../import-devup'
import * as getColorCollectionModule from '../utils/get-devup-color-collection'
import * as uploadXlsxModule from '../utils/upload-devup-xlsx'

afterAll(() => {
  mock.restore()
})

describe('import-devup length and shadow coverage', () => {
  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  test('imports length as FLOAT variables for single and responsive values', async () => {
    spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify({
        theme: {
          length: {
            default: {
              radiusMd: '16px',
              space: ['4px', null, '12px', null, '20px', '24px'],
            },
          },
        },
      }),
    )

    const existingFloatSetValueForMode = mock(() => {})
    const existingFloat = {
      id: 'v-space',
      name: 'space',
      resolvedType: 'FLOAT',
      setValueForMode: existingFloatSetValueForMode,
      remove: mock(() => {}),
    } as unknown as Variable

    const createdSetValueForMode = mock(() => {})
    const createVariable = mock(
      (name: string) =>
        ({
          id: `created-${name}`,
          name,
          resolvedType: 'FLOAT',
          setValueForMode: createdSetValueForMode,
          remove: mock(() => {}),
        }) as unknown as Variable,
    )

    const addMode = mock((name: string) => `${name}-id`)
    const collection = {
      variableIds: ['v-space'],
      modes: [] as { modeId: string; name: string }[],
      addMode,
      removeMode: mock(() => {}),
    } as unknown as VariableCollection

    spyOn(
      getColorCollectionModule,
      'getDevupColorCollection',
    ).mockResolvedValue(collection)

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () => collection,
        getLocalVariablesAsync: async () => [existingFloat],
        createVariable,
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      createEffectStyle: () => ({ name: '', effects: [] }),
      createTextStyle: mock(
        () =>
          ({
            name: '',
          }) as unknown as TextStyle,
      ),
      loadFontAsync: mock(async () => {}),
    } as unknown as typeof figma

    await importDevup('json')

    expect(createVariable).toHaveBeenCalledWith('radiusMd', collection, 'FLOAT')
    expect(addMode).toHaveBeenCalledWith('mobile')
    expect(addMode).toHaveBeenCalledWith('tablet')
    expect(addMode).toHaveBeenCalledWith('desktop')
    expect(addMode).toHaveBeenCalledWith('5')
    expect(createdSetValueForMode).toHaveBeenCalledWith('mobile-id', 16)
    expect(existingFloatSetValueForMode).toHaveBeenCalledWith('mobile-id', 4)
    expect(existingFloatSetValueForMode).toHaveBeenCalledWith('tablet-id', 12)
    expect(existingFloatSetValueForMode).toHaveBeenCalledWith('desktop-id', 20)
    expect(existingFloatSetValueForMode).toHaveBeenCalledWith('5-id', 24)
  })

  test('imports shadow styles and parses hex, rgba, inset and multiple shadows', async () => {
    spyOn(uploadFileModule, 'uploadFile').mockResolvedValue(
      JSON.stringify({
        theme: {
          shadows: {
            default: {
              soft: '1px 2px 3px 4px #abc',
              layered: [
                null,
                null,
                'inset 4px 5px 6px 7px #11223344, 8px 9px 10px 0 rgba(1, 2, 3, 0.4)',
              ],
              invalid: '1px 2px not-a-color',
            },
          },
        },
      }),
    )

    const existingStyle = {
      name: 'mobile/soft',
      effects: [],
    } as unknown as EffectStyle
    const createdStyles: Array<{ name: string; effects: Effect[] }> = []
    const createEffectStyle = mock(() => {
      const created = { name: '', effects: [] as Effect[] }
      createdStyles.push(created)
      return created as unknown as EffectStyle
    })

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () =>
          ({
            variableIds: [],
            modes: [],
            addMode: mock(() => 'm1'),
            removeMode: mock(() => {}),
          }) as unknown as VariableCollection,
        getLocalVariablesAsync: async () => [],
        createVariable: mock(
          () =>
            ({
              id: 'x',
              name: 'x',
              setValueForMode: mock(() => {}),
              remove: mock(() => {}),
            }) as unknown as Variable,
        ),
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [existingStyle],
      createEffectStyle,
      createTextStyle: mock(
        () =>
          ({
            name: '',
          }) as unknown as TextStyle,
      ),
      loadFontAsync: mock(async () => {}),
    } as unknown as typeof figma

    await importDevup('json')

    expect(existingStyle.name).toBe('mobile/soft')
    expect(existingStyle.effects).toHaveLength(1)
    expect(existingStyle.effects[0]).toMatchObject({
      type: 'DROP_SHADOW',
      offset: { x: 1, y: 2 },
      radius: 3,
      spread: 4,
    })

    const tabletLayered = createdStyles.find((s) => s.name === 'tablet/layered')
    expect(tabletLayered).toBeDefined()
    expect(tabletLayered?.effects).toHaveLength(2)
    expect(tabletLayered?.effects[0]).toMatchObject({
      type: 'INNER_SHADOW',
      offset: { x: 4, y: 5 },
      radius: 6,
      spread: 7,
    })
    expect(tabletLayered?.effects[1]).toMatchObject({
      type: 'DROP_SHADOW',
      offset: { x: 8, y: 9 },
      radius: 10,
      spread: 0,
    })

    const invalidStyle = createdStyles.find((s) => s.name === 'mobile/invalid')
    expect(invalidStyle).toBeDefined()
    expect(invalidStyle?.effects).toHaveLength(1)
    expect(invalidStyle?.effects[0]).toMatchObject({
      color: { r: 0, g: 0, b: 0, a: 1 },
    })
    expect(createEffectStyle).toHaveBeenCalledTimes(2)
  })

  test('loads excel payload path and exits safely for empty theme', async () => {
    const uploadXlsx = spyOn(
      uploadXlsxModule,
      'uploadDevupXlsx',
    ).mockResolvedValue({})

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        createVariableCollection: () =>
          ({
            variableIds: [],
            modes: [],
            addMode: mock(() => 'm1'),
            removeMode: mock(() => {}),
          }) as unknown as VariableCollection,
        getLocalVariablesAsync: async () => [],
        createVariable: mock(
          () =>
            ({
              id: 'x',
              name: 'x',
              setValueForMode: mock(() => {}),
              remove: mock(() => {}),
            }) as unknown as Variable,
        ),
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      createEffectStyle: () => ({ name: '', effects: [] }),
      createTextStyle: mock(
        () =>
          ({
            name: '',
          }) as unknown as TextStyle,
      ),
      loadFontAsync: mock(async () => {}),
    } as unknown as typeof figma

    await importDevup('excel')

    expect(uploadXlsx).toHaveBeenCalled()
  })
})
