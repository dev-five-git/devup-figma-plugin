import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import * as devupModule from '../commands/devup'
import * as exportAssetsModule from '../commands/exportAssets'
import * as exportComponentsModule from '../commands/exportComponents'

const exportDevupMock = mock(() => Promise.resolve(0))
const importDevupMock = mock(() => Promise.resolve())
const exportAssetsMock = mock(() => Promise.resolve())
const exportComponentsMock = mock(() => Promise.resolve())

let exportDevupSpy: ReturnType<typeof spyOn> | undefined
let importDevupSpy: ReturnType<typeof spyOn> | undefined
let exportAssetsSpy: ReturnType<typeof spyOn> | undefined
let exportComponentsSpy: ReturnType<typeof spyOn> | undefined

const cacheBust = () => `?t=${Date.now()}-${Math.random()}`

beforeEach(() => {
  exportDevupMock.mockReset()
  importDevupMock.mockReset()
  exportAssetsMock.mockReset()
  exportComponentsMock.mockReset()

  exportDevupSpy?.mockRestore()
  importDevupSpy?.mockRestore()
  exportAssetsSpy?.mockRestore()
  exportComponentsSpy?.mockRestore()

  exportDevupSpy = spyOn(devupModule, 'exportDevup').mockImplementation(
    exportDevupMock,
  )
  importDevupSpy = spyOn(devupModule, 'importDevup').mockImplementation(
    importDevupMock,
  )
  exportAssetsSpy = spyOn(
    exportAssetsModule,
    'exportAssets',
  ).mockImplementation(exportAssetsMock)
  exportComponentsSpy = spyOn(
    exportComponentsModule,
    'exportComponents',
  ).mockImplementation(exportComponentsMock)
})

afterAll(() => {
  exportDevupSpy?.mockRestore()
  importDevupSpy?.mockRestore()
  exportAssetsSpy?.mockRestore()
  exportComponentsSpy?.mockRestore()
})

describe('figma command dispatch', () => {
  test('export devup', async () => {
    const closePlugin = mock(() => {})
    ;(globalThis as { figma?: unknown }).figma = {
      editorType: 'figma',
      command: 'export-devup',
      closePlugin,
    } as unknown as typeof figma

    exportDevupMock.mockResolvedValueOnce(0)
    await import(`../code${cacheBust()}`)
    expect(exportDevupMock).toHaveBeenCalledTimes(1)
    expect(closePlugin).toHaveBeenCalledTimes(1)
  })

  test('import devup', async () => {
    const closePlugin = mock(() => {})
    ;(globalThis as { figma?: unknown }).figma = {
      editorType: 'figma',
      command: 'import-devup',
      closePlugin,
    } as unknown as typeof figma

    importDevupMock.mockResolvedValueOnce()
    await import(`../code${cacheBust()}`)
    expect(importDevupMock).toHaveBeenCalledTimes(1)
    expect(closePlugin).toHaveBeenCalledTimes(1)
  })

  test('export assets', async () => {
    const closePlugin = mock(() => {})
    ;(globalThis as { figma?: unknown }).figma = {
      editorType: 'figma',
      command: 'export-assets',
      closePlugin,
    } as unknown as typeof figma

    exportAssetsMock.mockResolvedValueOnce()
    await import(`../code${cacheBust()}`)
    expect(exportAssetsMock).toHaveBeenCalledTimes(1)
    expect(closePlugin).toHaveBeenCalledTimes(1)
  })

  test('export components', async () => {
    const closePlugin = mock(() => {})
    ;(globalThis as { figma?: unknown }).figma = {
      editorType: 'figma',
      command: 'export-components',
      closePlugin,
    } as unknown as typeof figma

    exportComponentsMock.mockResolvedValueOnce()
    await import(`../code${cacheBust()}`)
    expect(exportComponentsMock).toHaveBeenCalledTimes(1)
    expect(closePlugin).toHaveBeenCalledTimes(1)
  })
})

describe('codegen', () => {
  test('registers generate handler', async () => {
    const closePlugin = mock(() => {})
    const on = mock(() => {})
    ;(globalThis as { figma?: unknown }).figma = {
      editorType: 'dev',
      mode: 'codegen',
      closePlugin,
      codegen: {
        on,
      },
    } as unknown as typeof figma

    await import(`../code${cacheBust()}`)
    expect(closePlugin).toHaveBeenCalledTimes(0)
    expect(on).toHaveBeenCalledTimes(1)
    expect(on).toHaveBeenCalledWith('generate', expect.any(Function))

    const callback = (on as ReturnType<typeof mock>).mock.calls[0][1] as (
      ...args: unknown[]
    ) => Promise<unknown>

    const resVisible = await callback({
      node: {
        type: 'code',
        code: 'code',
        getCSSAsync: async () => ({ background: 'red' }),
        visible: true,
      },
    })
    expect(Array.isArray(resVisible)).toBe(true)

    const resHidden = await callback({
      node: {
        type: 'code',
        code: 'code',
        getCSSAsync: async () => ({ background: 'red' }),
        visible: false,
      },
    })
    expect(Array.isArray(resHidden)).toBe(true)
  })
})
