import { describe, expect, mock, test } from 'bun:test'
import { downloadDevupXlsx } from '../download-devup-xlsx'

describe('downloadDevupXlsx', () => {
  function createMockFigma() {
    const showUIMock = mock(() => {})
    const postMessageMock = mock(() => {})
    let onmessageHandler: ((message: unknown) => void) | null = null

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

    const ctx = {
      showUI: showUIMock,
      ui: uiObj,
    } as unknown as typeof figma

    return {
      ctx,
      showUIMock,
      postMessageMock,
      getHandler: () => onmessageHandler,
    }
  }

  test('should call showUI with correct HTML string and visible false', () => {
    const { ctx, showUIMock } = createMockFigma()
    downloadDevupXlsx(
      'test.xlsx',
      '{"theme":{"colors":{},"typography":{}}}',
      ctx,
    )
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
    const { ctx, getHandler, postMessageMock } = createMockFigma()
    downloadDevupXlsx(
      'test.xlsx',
      '{"theme":{"colors":{},"typography":{}}}',
      ctx,
    )
    expect(getHandler()).not.toBeNull()
    expect(postMessageMock).toHaveBeenCalledWith({
      type: 'download',
      fileName: 'test.xlsx',
      data: '{"theme":{"colors":{},"typography":{}}}',
    })
  })

  test('should return a promise that resolves when onmessage is called', async () => {
    const { ctx, getHandler, postMessageMock } = createMockFigma()
    const promise = downloadDevupXlsx(
      'test.xlsx',
      '{"theme":{"colors":{},"typography":{}}}',
      ctx,
    )

    // Simulate message from UI
    const handler = getHandler()
    if (handler) {
      handler(undefined)
    }

    await promise
    expect(postMessageMock).toHaveBeenCalled()
  })

  test('should handle different file names and data', () => {
    const { ctx, postMessageMock } = createMockFigma()
    downloadDevupXlsx(
      'devup.xlsx',
      JSON.stringify({
        theme: { colors: { light: { primary: '#000' } }, typography: {} },
      }),
      ctx,
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
