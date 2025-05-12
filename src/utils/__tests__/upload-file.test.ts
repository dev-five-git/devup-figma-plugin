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
})
