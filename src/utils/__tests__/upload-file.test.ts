import { uploadFile } from '../upload-file'

describe('uploadFile', () => {
  it('should upload file', () => {
    const showUI = vi.fn()
    const obj = {}

    ;(globalThis as any).figma = {
      showUI,
      ui: obj,
    } as any
    uploadFile('.txt')
    expect(showUI).toHaveBeenCalledWith(expect.stringContaining('.txt'))
  })

  it('should resolve with decoded value and close UI on message', async () => {
    const showUI = vi.fn()
    const close = vi.fn()
    const onmessageSetter = vi.fn()
    let onmessageHandler: any = null
    const obj: any = {}
    Object.defineProperty(obj, 'onmessage', {
      set: (fn) => {
        onmessageHandler = fn
        onmessageSetter(fn)
      },
      get: () => onmessageHandler,
      configurable: true,
    })
    const base64Decode = vi.fn(() => [65, 66, 67]) // 'ABC'
    ;(globalThis as any).figma = {
      showUI,
      ui: obj,
      base64Decode,
    }
    obj.close = close
    const promise = uploadFile('.txt')
    // onmessage이 호출되었을 때
    onmessageHandler('dummy')
    const result = await promise
    expect(close).toHaveBeenCalled()
    expect(base64Decode).toHaveBeenCalledWith('dummy')
    expect(result).toBe('ABC')
  })
})
