import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { registerCodegen, run, runCommand } from '../code'
import * as devupModule from '../commands/devup'
import * as exportAssetsModule from '../commands/exportAssets'
import * as exportComponentsModule from '../commands/exportComponents'

beforeAll(() => {
  ;(globalThis as { figma?: unknown }).figma = {
    editorType: 'dev',
    mode: 'codegen',
    command: 'noop',
    codegen: { on: mock(() => {}) },
    closePlugin: mock(() => {}),
  } as unknown as typeof figma
})

beforeEach(() => {
  spyOn(devupModule, 'exportDevup').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(devupModule, 'importDevup').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(exportAssetsModule, 'exportAssets').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(exportComponentsModule, 'exportComponents').mockImplementation(
    mock(() => Promise.resolve()),
  )
})

afterEach(() => {
  ;(globalThis as { figma?: unknown }).figma = undefined
  mock.restore()
})

describe('runCommand', () => {
  it.each([
    ['export-devup', ['json'], 'exportDevup'],
    ['export-devup-without-treeshaking', ['json', false], 'exportDevup'],
    ['export-devup-excel', ['excel'], 'exportDevup'],
    ['export-devup-excel-without-treeshaking', ['excel', false], 'exportDevup'],
    ['import-devup', ['json'], 'importDevup'],
    ['import-devup-excel', ['excel'], 'importDevup'],
    ['export-assets', [], 'exportAssets'],
    ['export-components', [], 'exportComponents'],
  ] as const)('dispatches %s', async (command, args, fn) => {
    const closePlugin = mock(() => {})
    const figmaMock = {
      editorType: 'figma',
      command,
      closePlugin,
    } as unknown as typeof figma

    await runCommand(figmaMock as typeof figma)

    switch (fn) {
      case 'exportDevup':
        expect(devupModule.exportDevup).toHaveBeenCalledWith(...args)
        break
      case 'importDevup':
        expect(devupModule.importDevup).toHaveBeenCalledWith(...args)
        break
      case 'exportAssets':
        expect(exportAssetsModule.exportAssets).toHaveBeenCalled()
        break
      case 'exportComponents':
        expect(exportComponentsModule.exportComponents).toHaveBeenCalled()
        break
    }
    expect(closePlugin).toHaveBeenCalled()
  })
})

describe('registerCodegen', () => {
  it.each([
    [
      {
        editorType: 'dev',
        mode: 'codegen',
        command: 'noop',
      },
      {
        node: {
          type: 'COMPONENT',
          name: 'Test',
        },
        language: 'devup-ui',
      },
    ],
    [
      {
        editorType: 'dev',
        mode: 'codegen',
        command: 'noop',
      },
      {
        node: {
          type: 'FRAME',
          name: 'Main',
        },
        language: 'devup-ui',
      },
    ],
    [
      {
        editorType: 'dev',
        mode: 'codegen',
        command: 'noop',
      },
      {
        node: {
          type: 'FRAME',
          name: 'Other',
        },
        language: 'other',
      },
    ],
  ] as const)('should register codegen', async (figmaInfo, event) => {
    const figmaMock = {
      ...figmaInfo,
      codegen: { on: mock(() => {}) },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma
    registerCodegen(figmaMock)
    expect(figmaMock.codegen.on).toHaveBeenCalledWith(
      'generate',
      expect.any(Function),
    )

    expect(
      await (figmaMock.codegen.on as ReturnType<typeof mock>).mock.calls[0][1](
        event,
      ),
    ).toMatchSnapshot()
  })
})

it('should not register codegen if figma is not defined', () => {
  run(undefined as unknown as typeof figma)
  expect(devupModule.exportDevup).not.toHaveBeenCalled()
  expect(devupModule.importDevup).not.toHaveBeenCalled()
  expect(exportAssetsModule.exportAssets).not.toHaveBeenCalled()
  expect(exportComponentsModule.exportComponents).not.toHaveBeenCalled()
})

it('should run command', () => {
  const figmaMock = {
    editorType: 'figma',
    command: 'export-devup',
    closePlugin: mock(() => {}),
  } as unknown as typeof figma
  run(figmaMock as typeof figma)
  expect(devupModule.exportDevup).toHaveBeenCalledWith('json')
  expect(devupModule.importDevup).not.toHaveBeenCalled()
  expect(exportAssetsModule.exportAssets).not.toHaveBeenCalled()
  expect(exportComponentsModule.exportComponents).not.toHaveBeenCalled()
})
