import { describe, expect, mock, test } from 'bun:test'
import { downloadFile } from '../download-file'

describe('downloadFile', () => {
  test('should download file', () => {
    const showUI = mock(() => {})

    const postMessage = mock(() => {})
    const obj = {
      postMessage,
    }

    ;(globalThis as { figma?: unknown }).figma = {
      showUI,
      ui: obj,
    } as unknown as typeof figma
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
