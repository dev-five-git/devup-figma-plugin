import { downloadFile } from '../download-file'

describe('downloadFile', () => {
  it('should download file', () => {
    const showUI = vi.fn()
    const obj = {}

    ;(globalThis as any).figma = {
      showUI,
      ui: obj,
    } as any
    downloadFile('filename.txt', 'text')
    expect(showUI).toHaveBeenCalledWith(
      expect.stringContaining('filename.txt'),
      {
        visible: false,
      },
    )
  })
})
