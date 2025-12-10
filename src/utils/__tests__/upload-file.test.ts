import { describe, expect, mock, test } from 'bun:test'
import { uploadFile } from '../upload-file'

describe('uploadFile', () => {
  test('should upload file', () => {
    const showUI = mock(() => {})
    const obj = {}

    ;(globalThis as { figma?: unknown }).figma = {
      showUI,
      ui: obj,
    } as unknown as typeof figma
    uploadFile('.txt')
    expect(showUI).toHaveBeenCalledWith(expect.stringContaining('.txt'))
  })

  test('should resolve with decoded value and close UI on message', async () => {
    const showUI = mock(() => {})
    const close = mock(() => {})
    const onmessageSetter = mock(() => {})
    let onmessageHandler: ((data: string) => void) | null = null
    const obj: { onmessage?: (data: string) => void; close?: () => void } = {}
    Object.defineProperty(obj, 'onmessage', {
      set: (fn) => {
        onmessageHandler = fn
        onmessageSetter()
      },
      get: () => onmessageHandler,
      configurable: true,
    })
    const base64Decode = mock(() => [65, 66, 67]) // 'ABC'
    ;(globalThis as { figma?: unknown }).figma = {
      showUI,
      ui: obj,
      base64Decode,
    } as unknown as typeof figma
    obj.close = close
    const promise = uploadFile('.txt')
    // invoke onmessage
    // biome-ignore lint/style/noNonNullAssertion: onmessageHandler is set
    onmessageHandler!('dummy')
    const result = await promise
    expect(close).toHaveBeenCalled()
    expect(base64Decode).toHaveBeenCalledWith('dummy')
    expect(result).toBe('ABC')
  })
})
