import { downloadFile } from '../download-file'

describe('downloadFile', () => {
  it('should download file', () => {
    const showUI = vi.fn()

    const postMessage = vi.fn()
    const obj = {
      postMessage,
    }

    ;(globalThis as any).figma = {
      showUI,
      ui: obj,
    } as any
    downloadFile('filename.txt', 'text')
    expect(showUI).toHaveBeenCalledWith(expect.any(String), {
      visible: false,
    })
    expect(postMessage).toHaveBeenCalledWith({
      type: 'download',
      fileName: 'filename.txt',
      data: 'text',
    })
  })
})
