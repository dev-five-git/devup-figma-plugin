import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { registerCodegen } from '../code-impl'
import { Codegen } from '../codegen/Codegen'
import { ResponsiveCodegen } from '../codegen/responsive/ResponsiveCodegen'

const runMock = mock(async () => {})
const getComponentsCodesMock = mock(() => [])
const getCodeMock = mock(() => 'base-code')
const generateResponsiveResultMock = mock(() => {
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
const originalGenerateResponsiveResult =
  ResponsiveCodegen.prototype.generateResponsiveResult

describe('registerCodegen responsive error handling', () => {
  beforeEach(() => {
    Codegen.prototype.run = runMock as unknown as typeof Codegen.prototype.run
    Codegen.prototype.getComponentsCodes = getComponentsCodesMock
    Codegen.prototype.getCode = getCodeMock
    ResponsiveCodegen.prototype.generateResponsiveResult =
      generateResponsiveResultMock

    console.error = consoleErrorMock as typeof console.error
    resetFigma()
  })

  afterEach(() => {
    Codegen.prototype.run = originalRun
    Codegen.prototype.getComponentsCodes = originalGetComponentsCodes
    Codegen.prototype.getCode = originalGetCode
    ResponsiveCodegen.prototype.generateResponsiveResult =
      originalGenerateResponsiveResult

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
    // Pure Code is generated via a separate Codegen instance whose run()/getCode()
    // hit the same prototype mocks, so its code is also 'base-code'.
    expect(result).toEqual([
      {
        title: 'Pure Code',
        language: 'TYPESCRIPT',
        code: 'base-code',
      },
      {
        title: 'Main',
        language: 'TYPESCRIPT',
        code: 'base-code',
      },
    ])
  })
})

describe('registerCodegen pure code error handling', () => {
  // Throws ONLY for the Pure Code Codegen instance (inlineAllInstances=true),
  // letting the main codegen run normally so we can isolate the catch branch.
  const pureCodeRunMock = mock(async function (this: {
    options?: { inlineAllInstances?: boolean }
  }) {
    if (this.options?.inlineAllInstances) {
      throw new Error('pure-code-boom')
    }
  })

  beforeEach(() => {
    Codegen.prototype.run =
      pureCodeRunMock as unknown as typeof Codegen.prototype.run
    Codegen.prototype.getComponentsCodes = getComponentsCodesMock
    Codegen.prototype.getCode = getCodeMock

    console.error = consoleErrorMock as typeof console.error
    resetFigma()
  })

  afterEach(() => {
    Codegen.prototype.run = originalRun
    Codegen.prototype.getComponentsCodes = originalGetComponentsCodes
    Codegen.prototype.getCode = originalGetCode

    console.error = originalError
    resetFigma()
    mock.restore()
  })

  test('swallows pure code errors and omits the Pure Code entry', async () => {
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
      name: 'PureFail',
    } as unknown as SceneNode

    registerCodegen(ctx)

    const generate = handlerCalls[0]
    const result = await generate({ node, language: 'devup-ui' })

    // Pure Code generation threw → console.error captured the failure.
    expect(consoleErrorMock).toHaveBeenCalled()

    // Pure Code entry must be ABSENT in the result.
    expect(
      result.find((r) => (r as { title?: string }).title === 'Pure Code'),
    ).toBeUndefined()

    // Main code remains present (FRAME → showMainCode true).
    expect(
      result.find((r) => (r as { title?: string }).title === 'PureFail'),
    ).toBeDefined()
  })
})
