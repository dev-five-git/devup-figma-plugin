import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { registerCodegen } from '../code-impl'
import { Codegen } from '../codegen/Codegen'
import { ResponsiveCodegen } from '../codegen/responsive/ResponsiveCodegen'

const runMock = mock(async () => {})
const getComponentsCodesMock = mock(() => [])
const getCodeMock = mock(() => 'base-code')
const generateResponsiveCodeMock = mock(() => {
  throw new Error('boom')
})

const originalError = console.error
const consoleErrorMock = mock(() => {})

const resetFigma = () => {
  ;(globalThis as { figma?: unknown }).figma = undefined
}

const originalRun = Codegen.prototype.run
const originalGetComponentsCodes = Codegen.prototype.getComponentsCodes
const originalGetCode = Codegen.prototype.getCode
const originalGenerateResponsiveCode =
  ResponsiveCodegen.prototype.generateResponsiveCode

describe('registerCodegen responsive error handling', () => {
  beforeEach(() => {
    Codegen.prototype.run = runMock as unknown as typeof Codegen.prototype.run
    Codegen.prototype.getComponentsCodes = getComponentsCodesMock
    Codegen.prototype.getCode = getCodeMock
    ResponsiveCodegen.prototype.generateResponsiveCode =
      generateResponsiveCodeMock

    console.error = consoleErrorMock as typeof console.error
    resetFigma()
  })

  afterEach(() => {
    Codegen.prototype.run = originalRun
    Codegen.prototype.getComponentsCodes = originalGetComponentsCodes
    Codegen.prototype.getCode = originalGetCode
    ResponsiveCodegen.prototype.generateResponsiveCode =
      originalGenerateResponsiveCode

    console.error = originalError
    resetFigma()
    mock.restore()
  })

  test('swallows responsive errors and still returns base code', async () => {
    const handlerCalls: ((event: CodegenEvent) => Promise<CodegenResult[]>)[] =
      []
    const ctx = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: mock((_event, handler) => {
          handlerCalls.push(handler)
        }),
      },
    } as unknown as typeof figma

    const node = {
      type: 'FRAME',
      name: 'Main',
      parent: { type: 'SECTION', name: 'Parent', children: [] },
    } as unknown as SceneNode

    registerCodegen(ctx)

    const generate = handlerCalls[0]
    const result = await generate({ node, language: 'devup-ui' })

    expect(consoleErrorMock).toHaveBeenCalled()
    expect(runMock).toHaveBeenCalled()
    expect(result).toEqual([
      {
        title: 'Main',
        language: 'TYPESCRIPT',
        code: 'base-code',
      },
    ])
  })
})
