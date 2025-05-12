import { exportDevup, importDevup } from '../devup'

vi.mock('../devup')

beforeEach(() => {
  vi.resetModules()
})

describe('figma', () => {
  it('should export devup', async () => {
    const closePlugin = vi.fn()
    ;(globalThis as any).figma = {
      editorType: 'figma',
      command: 'export-devup',
      closePlugin,
    }
    vi.mocked(exportDevup).mockResolvedValueOnce(0)
    await import('../code')
    expect(exportDevup).toBeCalledTimes(1)
    expect(closePlugin).toBeCalledTimes(1)
  })
})
it('should import devup', async () => {
  const closePlugin = vi.fn()
  ;(globalThis as any).figma = {
    editorType: 'figma',
    command: 'import-devup',
    closePlugin,
  }
  vi.mocked(importDevup).mockResolvedValueOnce()
  await import('../code')
  expect(importDevup).toBeCalledTimes(1)
  expect(closePlugin).toBeCalledTimes(1)
})

describe('codegen', () => {
  it('should generate code', async () => {
    const closePlugin = vi.fn()
    const on = vi.fn()
    ;(globalThis as any).figma = {
      editorType: 'dev',
      mode: 'codegen',
      closePlugin,
      codegen: {
        on,
      },
    }
    await import('../code')
    expect(closePlugin).toBeCalledTimes(0)
    expect(on).toHaveBeenCalledExactlyOnceWith('generate', expect.any(Function))
    const callback = vi.mocked(on).mock.calls[0][1]

    expect(
      await callback({
        node: {
          type: 'code',
          code: 'code',
          getCSSAsync: async () => {
            return {
              background: 'red',
            }
          },
          visible: true,
        },
      }),
    ).toEqual([
      {
        code: '<Box bg="red" />',
        language: 'JAVASCRIPT',
        title: undefined,
      },
    ])

    expect(
      await callback({
        node: {
          type: 'code',
          code: 'code',
          getCSSAsync: async () => {
            return {
              background: 'red',
            }
          },
          visible: false,
        },
      }),
    ).toEqual([
      {
        code: '',
        language: 'JAVASCRIPT',
        title: undefined,
      },
    ])
  })
})
