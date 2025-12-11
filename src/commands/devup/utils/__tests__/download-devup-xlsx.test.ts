import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { downloadDevupXlsx } from '../download-devup-xlsx'

describe('downloadDevupXlsx', () => {
  let showUIMock: ReturnType<typeof mock>
  let postMessageMock: ReturnType<typeof mock>
  let onmessageHandler: ((message: unknown) => void) | null = null

  beforeEach(() => {
    showUIMock = mock(() => {})
    postMessageMock = mock(() => {})
    onmessageHandler = null

    const uiObj: {
      onmessage?: (message: unknown) => void
      postMessage?: (message: unknown) => void
    } = {}

    Object.defineProperty(uiObj, 'onmessage', {
      set: (fn: (message: unknown) => void) => {
        onmessageHandler = fn
      },
      get: () => onmessageHandler,
      configurable: true,
    })

    uiObj.postMessage = postMessageMock

    ;(globalThis as { figma?: unknown }).figma = {
      showUI: showUIMock,
      ui: uiObj,
    } as unknown as typeof figma
  })

  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  test('should call showUI with correct HTML string and visible false', () => {
    downloadDevupXlsx('test.xlsx', '{"theme":{"colors":{},"typography":{}}}')
    expect(showUIMock).toHaveBeenCalledWith(
      expect.stringContaining('xlsx-0.20.3'),
      { visible: false },
    )
    expect(showUIMock).toHaveBeenCalledWith(
      expect.stringContaining('onmessage'),
      { visible: false },
    )
  })

  test('should set onmessage handler and post message', () => {
    downloadDevupXlsx('test.xlsx', '{"theme":{"colors":{},"typography":{}}}')
    expect(onmessageHandler).not.toBeNull()
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'download',
      fileName: 'test.xlsx',
      data: '{"theme":{"colors":{},"typography":{}}}',
    })
  })

  test('should return a promise that resolves when onmessage is called', async () => {
    const promise = downloadDevupXlsx(
      'test.xlsx',
      '{"theme":{"colors":{},"typography":{}}}',
    )

    // Simulate message from UI
    if (onmessageHandler) {
      onmessageHandler(undefined)
    }

    await promise
    expect(postMessageMock).toHaveBeenCalled()
  })

  test('should handle different file names and data', () => {
    downloadDevupXlsx(
      'devup.xlsx',
      JSON.stringify({
        theme: { colors: { light: { primary: '#000' } }, typography: {} },
      }),
    )
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'download',
      fileName: 'devup.xlsx',
      data: JSON.stringify({
        theme: { colors: { light: { primary: '#000' } }, typography: {} },
      }),
    })
  })
})
