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
import * as variableAliasToValueModule from '../../../utils/variable-alias-to-value'
import { buildDevupConfig, exportDevup } from '../export-devup'
import * as downloadXlsxModule from '../utils/download-devup-xlsx'

afterAll(() => {
  mock.restore()
})

describe('export-devup length and shadow coverage', () => {
  beforeEach(() => {
    spyOn(optimizeHexModule, 'optimizeHex').mockImplementation((v) => v)
    spyOn(rgbaToHexModule, 'rgbaToHex').mockImplementation(
      (rgba: RGBA) =>
        `#${Math.round(rgba.r * 255)
          .toString(16)
          .padStart(2, '0')}${Math.round(rgba.g * 255)
          .toString(16)
          .padStart(2, '0')}${Math.round(rgba.b * 255)
          .toString(16)
          .padStart(2, '0')}`,
    )
  })

  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
    mock.restore()
  })

  test('exports FLOAT variables with full breakpoint mapping and color theme resolution', async () => {
    const aliasGuard = spyOn(
      isVariableAliasModule,
      'isVariableAlias',
    ).mockImplementation(
      (value: unknown): value is VariableAlias =>
        typeof value === 'object' && value !== null && 'type' in value,
    )
    const aliasResolver = spyOn(
      variableAliasToValueModule,
      'variableAliasToValue',
    ).mockImplementation(async (_alias, modeId) => {
      if (modeId === 'mTablet') return 8
      if (modeId === 'mDesktop') return 10
      if (modeId === 'mSm') return null
      return null
    })

    const variablesById: Record<string, Variable | null> = {
      c1: {
        id: 'c1',
        name: 'Primary',
        resolvedType: 'COLOR',
        valuesByMode: { mLight: { r: 1, g: 0, b: 0, a: 1 } },
      } as unknown as Variable,
      fSingle: {
        id: 'fSingle',
        name: 'borderRadiusMd',
        resolvedType: 'FLOAT',
        valuesByMode: { mMobile: 16 },
      } as unknown as Variable,
      fResponsive: {
        id: 'fResponsive',
        name: 'spaceScale',
        resolvedType: 'FLOAT',
        valuesByMode: {
          mMobile: 4,
          mTablet: 12,
        },
      } as unknown as Variable,
      fAlias: {
        id: 'fAlias',
        name: 'inset',
        resolvedType: 'FLOAT',
        valuesByMode: {
          mSm: { type: 'VARIABLE_ALIAS', id: 'skip' },
          mTablet: { type: 'VARIABLE_ALIAS', id: 'a1' },
          mDesktop: { type: 'VARIABLE_ALIAS', id: 'a2' },
        },
      } as unknown as Variable,
      fNone: {
        id: 'fNone',
        name: 'unused',
        resolvedType: 'FLOAT',
        valuesByMode: {
          mUnknown: true,
        },
      } as unknown as Variable,
    }

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getLocalVariableCollectionsAsync: async () => [
          {
            variableIds: ['c1'],
            modes: [{ modeId: 'mLight', name: 'Light' }],
          },
          {
            variableIds: ['fSingle', 'fResponsive', 'fAlias', 'fNone'],
            modes: [
              { modeId: 'mMobile', name: 'mobile' },
              { modeId: 'mSm', name: 'sm' },
              { modeId: 'mTablet', name: 'tablet' },
              { modeId: 'mLg', name: 'lg' },
              { modeId: 'mDesktop', name: 'desktop' },
              { modeId: 'mPc', name: 'pc' },
              { modeId: 'mNumeric', name: '5' },
              { modeId: 'mUnknown', name: 'unknown' },
            ],
          },
          {
            variableIds: [],
            modes: [{ modeId: 'mEmpty', name: 'mobile' }],
          },
        ],
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(false)

    expect(aliasGuard).toHaveBeenCalled()
    expect(aliasResolver).toHaveBeenCalled()
    expect(devup.theme?.length?.light?.borderRadiusMd).toBe('16px')
    expect(devup.theme?.length?.light?.spaceScale).toEqual([
      '4px',
      null,
      '12px',
    ])
    expect(devup.theme?.length?.light?.inset).toEqual([
      '8px',
      null,
      '8px',
      null,
      '10px',
    ])
  })

  test('exports FLOAT variables to default theme when colors are missing', async () => {
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: async () =>
          ({
            id: 'f1',
            name: 'gapMd',
            resolvedType: 'FLOAT',
            valuesByMode: { m1: 20 },
          }) as unknown as Variable,
        getLocalVariableCollectionsAsync: async () => [
          {
            variableIds: ['f1'],
            modes: [{ modeId: 'm1', name: 'mobile' }],
          },
        ],
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(false)

    expect(devup.theme?.length?.default?.gapMd).toBe('20px')
  })

  test('exports effect styles as shadow with level prefixes and theme wrapper', async () => {
    const variablesById: Record<string, Variable | null> = {
      c1: {
        id: 'c1',
        name: 'Primary',
        resolvedType: 'COLOR',
        valuesByMode: { mLight: { r: 0, g: 0, b: 0, a: 1 } },
      } as unknown as Variable,
    }

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getLocalVariableCollectionsAsync: async () => [
          {
            variableIds: ['c1'],
            modes: [{ modeId: 'mLight', name: 'Light' }],
          },
        ],
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () =>
        [
          {
            id: 's1',
            name: 'mobile/cardShadow',
            effects: [
              {
                type: 'DROP_SHADOW',
                visible: true,
                radius: 8,
                spread: 2,
                color: { r: 0, g: 0, b: 0, a: 0.2 },
                offset: { x: 0, y: 4 },
                blendMode: 'NORMAL',
                showShadowBehindNode: false,
              },
            ],
          },
          {
            id: 's2',
            name: '3/cardShadow',
            effects: [
              {
                type: 'INNER_SHADOW',
                visible: true,
                radius: 6,
                spread: 1,
                color: { r: 0, g: 0, b: 0, a: 0.1 },
                offset: { x: 1, y: 2 },
                blendMode: 'NORMAL',
                showShadowBehindNode: false,
              },
            ],
          },
          {
            id: 's3',
            name: 'desktop/cardShadow',
            effects: [
              {
                type: 'DROP_SHADOW',
                visible: true,
                radius: 10,
                spread: 0,
                color: { r: 0, g: 0, b: 0, a: 0.3 },
                offset: { x: 0, y: 6 },
                blendMode: 'NORMAL',
                showShadowBehindNode: false,
              },
            ],
          },
          {
            id: 's4',
            name: 'tablet/ghostShadow',
            effects: [
              {
                type: 'DROP_SHADOW',
                visible: false,
                radius: 10,
                spread: 0,
                color: { r: 0, g: 0, b: 0, a: 0.3 },
                offset: { x: 0, y: 6 },
                blendMode: 'NORMAL',
                showShadowBehindNode: false,
              },
            ],
          },
        ] as unknown as EffectStyle[],
      root: { findAllWithCriteria: () => [], children: [] },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(false)

    expect(devup.theme?.shadows?.light?.cardShadow).toEqual([
      '0 4px 8px 2px #000000',
      null,
      null,
      'inset 1px 2px 6px 1px #000000',
      '0 6px 10px 0 #000000',
    ])
    expect(devup.theme?.shadows?.light?.ghostShadow).toBeUndefined()
  })

  test('exports color aliases and removes empty length theme buckets', async () => {
    const aliasResolver = spyOn(
      variableAliasToValueModule,
      'variableAliasToValue',
    ).mockImplementation(async (_alias, modeId) => {
      if (modeId === 'm1') return { r: 0, g: 0.5, b: 1, a: 1 }
      if (modeId === 'm2') return 10
      if (modeId === 'm3') return true
      return null
    })

    const variablesById: Record<string, Variable | null> = {
      colorAliasGood: {
        id: 'colorAliasGood',
        name: 'Accent',
        resolvedType: 'COLOR',
        valuesByMode: {
          m1: { type: 'VARIABLE_ALIAS', id: 'x1' },
          m2: true,
          m3: true,
        },
      } as unknown as Variable,
      colorAliasNumber: {
        id: 'colorAliasNumber',
        name: 'SkipNumber',
        resolvedType: 'COLOR',
        valuesByMode: {
          m1: true,
          m2: { type: 'VARIABLE_ALIAS', id: 'x2' },
          m3: true,
        },
      } as unknown as Variable,
      colorAliasBoolean: {
        id: 'colorAliasBoolean',
        name: 'SkipBoolean',
        resolvedType: 'COLOR',
        valuesByMode: {
          m1: true,
          m2: true,
          m3: { type: 'VARIABLE_ALIAS', id: 'x3' },
        },
      } as unknown as Variable,
      floatNoNumber: {
        id: 'floatNoNumber',
        name: 'emptyFloat',
        resolvedType: 'FLOAT',
        valuesByMode: {
          m1: { type: 'VARIABLE_ALIAS', id: 'x4' },
        },
      } as unknown as Variable,
    }

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: async (id: string) => variablesById[id] ?? null,
        getLocalVariableCollectionsAsync: async () => [
          {
            variableIds: [
              'colorAliasGood',
              'colorAliasNumber',
              'colorAliasBoolean',
              'floatNoNumber',
            ],
            modes: [
              { modeId: 'm1', name: 'Light' },
              { modeId: 'm2', name: 'tablet' },
              { modeId: 'm3', name: 'desktop' },
            ],
          },
        ],
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(false)

    expect(aliasResolver).toHaveBeenCalled()
    expect(devup.theme?.colors?.light?.accent).toBe('#0080ff')
    expect(devup.theme?.colors?.tablet?.skipNumber).toBeUndefined()
    expect(devup.theme?.colors?.desktop?.skipBoolean).toBeUndefined()
    expect(devup.theme?.length).toBeUndefined()
  })

  test('exportDevup sends excel output to xlsx downloader', async () => {
    const downloadXlsx = spyOn(
      downloadXlsxModule,
      'downloadDevupXlsx',
    ).mockResolvedValue(undefined)
    const downloadJson = spyOn(
      downloadFileModule,
      'downloadFile',
    ).mockResolvedValue(undefined)

    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      variables: {
        getVariableByIdAsync: async () => null,
        getLocalVariableCollectionsAsync: async () => [],
      },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      root: { findAllWithCriteria: () => [], children: [] },
    } as unknown as typeof figma

    await exportDevup('excel', false)

    expect(downloadXlsx).toHaveBeenCalledWith('devup.xlsx', JSON.stringify({}))
    expect(downloadJson).not.toHaveBeenCalled()
  })
})
