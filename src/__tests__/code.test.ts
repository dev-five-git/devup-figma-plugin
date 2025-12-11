import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { registerCodegen, runCommand } from '../code'
import { Codegen } from '../codegen/Codegen'
import * as devupModule from '../commands/devup'
import * as exportAssetsModule from '../commands/exportAssets'
import * as exportComponentsModule from '../commands/exportComponents'

const exportDevupMock = mock(() => Promise.resolve())
const importDevupMock = mock(() => Promise.resolve())
const exportAssetsMock = mock(() => Promise.resolve())
const exportComponentsMock = mock(() => Promise.resolve())
const codegenRunMock = mock(() => Promise.resolve())
const codegenGetCodeMock = mock(() => 'main-code')
const codegenGetComponentsCodesMock = mock(
  () => [['Comp', '<Comp />']] as [string, string][],
)

describe('code.ts', () => {
  beforeEach(() => {
    exportDevupMock.mockReset()
    importDevupMock.mockReset()
    exportAssetsMock.mockReset()
    exportComponentsMock.mockReset()
    codegenRunMock.mockReset()
    codegenGetCodeMock.mockReset()
    codegenGetComponentsCodesMock.mockReset()
    exportDevupMock.mockImplementation(() => Promise.resolve())
    importDevupMock.mockImplementation(() => Promise.resolve())
    exportAssetsMock.mockImplementation(() => Promise.resolve())
    exportComponentsMock.mockImplementation(() => Promise.resolve())
    codegenRunMock.mockImplementation(() => Promise.resolve())
    codegenGetCodeMock.mockImplementation(() => 'main-code')
    codegenGetComponentsCodesMock.mockImplementation(() => [
      ['Comp', '<Comp />'],
    ])

    spyOn(devupModule, 'exportDevup').mockImplementation(exportDevupMock)
    spyOn(devupModule, 'importDevup').mockImplementation(importDevupMock)
    spyOn(exportAssetsModule, 'exportAssets').mockImplementation(
      exportAssetsMock,
    )
    spyOn(exportComponentsModule, 'exportComponents').mockImplementation(
      exportComponentsMock,
    )

    spyOn(Codegen.prototype, 'run').mockImplementation(
      codegenRunMock as unknown as (
        node?: SceneNode,
        dep?: number,
      ) => Promise<string>,
    )
    spyOn(Codegen.prototype, 'getCode').mockImplementation(codegenGetCodeMock)
    spyOn(Codegen.prototype, 'getComponentsCodes').mockImplementation(
      codegenGetComponentsCodesMock,
    )
  })

  afterAll(() => {
    mock.restore()
  })

  describe('runCommand', () => {
    test('dispatches devup export/import and asset/component commands', async () => {
      const closePlugin = mock(() => {})
      const figmaBase = {
        editorType: 'figma',
        closePlugin,
      } as unknown as typeof figma

      runCommand({ ...figmaBase, command: 'export-devup' })
      await Promise.resolve()
      expect(exportDevupMock).toHaveBeenCalledWith('json')

      runCommand({ ...figmaBase, command: 'export-devup-without-treeshaking' })
      await Promise.resolve()
      expect(exportDevupMock).toHaveBeenCalledWith('json', false)

      runCommand({ ...figmaBase, command: 'export-devup-excel' })
      await Promise.resolve()
      expect(exportDevupMock).toHaveBeenCalledWith('excel')

      runCommand({
        ...figmaBase,
        command: 'export-devup-excel-without-treeshaking',
      })
      await Promise.resolve()
      expect(exportDevupMock).toHaveBeenCalledWith('excel', false)

      runCommand({ ...figmaBase, command: 'import-devup' })
      await Promise.resolve()
      expect(importDevupMock).toHaveBeenCalledWith('json')

      runCommand({ ...figmaBase, command: 'import-devup-excel' })
      await Promise.resolve()
      expect(importDevupMock).toHaveBeenCalledWith('excel')

      runCommand({ ...figmaBase, command: 'export-assets' })
      await Promise.resolve()
      expect(exportAssetsMock).toHaveBeenCalled()

      runCommand({ ...figmaBase, command: 'export-components' })
      await Promise.resolve()
      expect(exportComponentsMock).toHaveBeenCalled()

      expect(closePlugin).toHaveBeenCalledTimes(8)
    })
  })

  describe('registerCodegen', () => {
    test('wires generate handler and returns codes for devup-ui', async () => {
      const on = mock(() => {})
      const figmaMock = {
        editorType: 'dev',
        mode: 'codegen',
        codegen: { on },
      } as unknown as typeof figma

      registerCodegen(figmaMock)
      expect(on).toHaveBeenCalledWith('generate', expect.any(Function))

      const callback = (on.mock.calls[0] as unknown[])[1] as unknown as ({
        node,
        language,
      }: {
        node: SceneNode
        language: string
      }) => Promise<unknown[]>

      const res = (await callback({
        node: { type: 'FRAME', name: 'Frame1' } as unknown as SceneNode,
        language: 'devup-ui',
      })) as { title: string; language: string }[]

      expect(codegenRunMock).toHaveBeenCalled()
      expect(res.find((r) => r.title === 'Frame1')).toBeTruthy()
      expect(
        res.find((r) => r.title === 'Frame1 - Components CLI'),
      ).toBeTruthy()
    })

    test('returns empty array for other languages', async () => {
      const on = mock(() => {})
      const figmaMock = {
        editorType: 'dev',
        mode: 'codegen',
        codegen: { on },
      } as unknown as typeof figma

      registerCodegen(figmaMock)
      const callback = (on.mock.calls[0] as unknown[])[1] as unknown as ({
        node,
        language,
      }: {
        node: SceneNode
        language: string
      }) => Promise<unknown[]>

      const res = await callback({
        node: { type: 'FRAME', name: 'Frame1' } as unknown as SceneNode,
        language: 'other',
      })

      expect(Array.isArray(res)).toBe(true)
      expect((res as unknown[]).length).toBe(0)
    })
  })
})
