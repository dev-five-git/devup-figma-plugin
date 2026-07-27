import { describe, expect, mock, test } from 'bun:test'
import type { Devup } from '../../types'
import { uploadDevupXlsx } from '../upload-devup-xlsx'

describe('uploadDevupXlsx', () => {
  function setupMockFigma() {
    const showUIMock = mock(() => {})
    const closeMock = mock(() => {})
    const notifyMock = mock(() => {})
    let onmessageHandler: ((message: string) => void) | null = null

    const uiObj: {
      onmessage?: (message: string) => void
      close?: () => void
    } = {}

    Object.defineProperty(uiObj, 'onmessage', {
      set: (fn: (message: string) => void) => {
        onmessageHandler = fn
      },
      get: () => onmessageHandler,
      configurable: true,
    })

    uiObj.close = closeMock

    const ctx = {
      showUI: showUIMock,
      ui: uiObj,
      notify: notifyMock,
    } as unknown as typeof figma

    // Also set globalThis.figma as fallback — guards against Bun's parallel
    // test runner potentially resolving a cached module without the ctx param.
    ;(globalThis as { figma?: unknown }).figma = ctx

    return {
      ctx,
      showUIMock,
      closeMock,
      notifyMock,
      getHandler: () => onmessageHandler,
    }
  }

  function teardown() {
    ;(globalThis as { figma?: unknown }).figma = undefined
  }

  test('should call showUI with correct HTML string', () => {
    const { ctx, showUIMock } = setupMockFigma()
    try {
      uploadDevupXlsx(ctx)
      expect(showUIMock).toHaveBeenCalledWith(
        expect.stringContaining('accept=".xlsx"'),
      )
      expect(showUIMock).toHaveBeenCalledWith(
        expect.stringContaining('xlsx-0.20.3'),
      )
    } finally {
      teardown()
    }
  })

  test('should resolve with parsed JSON when message is received', async () => {
    const { ctx, closeMock, getHandler } = setupMockFigma()
    try {
      const testData = { theme: { colors: {}, typography: {} } }
      const promise = uploadDevupXlsx(ctx)

      const handler = getHandler()
      if (handler) {
        handler(JSON.stringify(testData))
      }

      const result = await promise
      expect(closeMock).toHaveBeenCalled()
      expect(result).toEqual(testData)
    } finally {
      teardown()
    }
  })

  test('should handle message with colors and typography', async () => {
    const { ctx, getHandler } = setupMockFigma()
    try {
      const testData = {
        theme: {
          colors: {
            light: {
              primary: '#000000',
            },
          },
          typography: {
            heading: {
              fontFamily: 'Arial',
              fontSize: 24,
            },
          },
        },
      }
      const promise = uploadDevupXlsx(ctx)

      const handler = getHandler()
      if (handler) {
        handler(JSON.stringify(testData))
      }

      const result = await promise
      expect(result).toEqual(testData as unknown as Devup)
    } finally {
      teardown()
    }
  })

  test('notifies and still resolves when the iframe reports a failure', async () => {
    const { ctx, getHandler, notifyMock } = setupMockFigma()
    try {
      const promise = uploadDevupXlsx(ctx)

      getHandler()?.(
        JSON.stringify({
          theme: { colors: {}, typography: {} },
          error: 'bad workbook',
        }),
      )

      // A failed read must resolve (so the plugin closes) and surface why —
      // the marker itself must not leak into the imported config.
      expect(await promise).toEqual({ theme: { colors: {}, typography: {} } })
      expect(notifyMock).toHaveBeenCalledWith(
        'Failed to import the xlsx file: bad workbook',
        { error: true },
      )
    } finally {
      teardown()
    }
  })
})

/**
 * Execute the serialized iframe script for real, against stubbed browser
 * globals, so the import path is regression-tested instead of only being
 * asserted as an HTML string.
 */
function runUploadIframe(
  html: string,
  sheets: Record<string, unknown[]>,
  options: { failReader?: boolean; readThrows?: boolean } = {},
) {
  const body = html.split('<script>')[1].split('</script>')[0]
  const posted: { pluginMessage?: string }[] = []
  const readers: { onerror?: () => void; onload?: (event: unknown) => void }[] =
    []

  class FakeFileReader {
    onerror?: () => void
    onload?: (event: unknown) => void
    constructor() {
      readers.push(this)
    }
    readAsDataURL() {
      // The stub captures the instance; decoding happens in the test itself.
    }
  }

  const factory = new Function(
    'globalThis',
    'window',
    'FileReader',
    `${body}; return uploadFile;`,
  ) as unknown as (
    fakeGlobalThis: unknown,
    fakeWindow: unknown,
    fakeFileReader: unknown,
  ) => (event: unknown) => void

  const uploadFile = factory(
    {
      XLSX: {
        read: () => {
          if (options.readThrows) throw new Error('bad workbook')
          return { Sheets: sheets }
        },
        utils: { sheet_to_json: (sheet: unknown[]) => sheet },
      },
    },
    {
      parent: {
        postMessage: (message: { pluginMessage?: string }) => {
          posted.push(message)
        },
      },
    },
    FakeFileReader,
  )

  uploadFile({ target: { files: [{}] } })
  const reader = readers[0]
  if (options.failReader) reader.onerror?.()
  else reader.onload?.({ target: { result: 'data:application/x;base64,QUJD' } })

  return JSON.parse(posted[0].pluginMessage ?? '{}') as Devup & {
    error?: string
  }
}

describe('uploadDevupXlsx iframe script', () => {
  const showUIMock = mock(() => {})
  const ctx = {
    showUI: showUIMock,
    ui: { onmessage: undefined, close: () => {} },
  } as unknown as typeof figma

  function iframeHtml(): string {
    showUIMock.mockClear()
    uploadDevupXlsx(ctx)
    return (showUIMock.mock.calls[0] as unknown as [string])[0]
  }

  test('parses both sheets into a devup config', () => {
    expect(
      runUploadIframe(iframeHtml(), {
        Colors: [{ Theme: 'primary', dark: '#fff', light: '#000' }],
        Typography: [{ Level: 0, Name: 'heading', fontFamily: 'Inter' }],
      }),
    ).toEqual({
      theme: {
        colors: { dark: { primary: '#fff' }, light: { primary: '#000' } },
        typography: { heading: { fontFamily: 'Inter' } },
      },
    })
  })

  test('imports a workbook without a Colors sheet', () => {
    expect(
      runUploadIframe(iframeHtml(), {
        Typography: [{ Level: 0, Name: 'heading', fontFamily: 'Inter' }],
      }),
    ).toEqual({
      theme: { colors: {}, typography: { heading: { fontFamily: 'Inter' } } },
    })
  })

  test('imports a workbook without a Typography sheet', () => {
    expect(
      runUploadIframe(iframeHtml(), {
        Colors: [{ Theme: 'primary', light: '#000' }],
      }),
    ).toEqual({
      theme: { colors: { light: { primary: '#000' } }, typography: {} },
    })
  })

  test('answers with the error instead of leaving the plugin pending', () => {
    expect(runUploadIframe(iframeHtml(), {}, { readThrows: true })).toEqual({
      error: 'bad workbook',
      theme: { colors: {}, typography: {} },
    })
  })

  test('answers when the file itself cannot be read', () => {
    expect(runUploadIframe(iframeHtml(), {}, { failReader: true })).toEqual({
      error: 'the file could not be read',
      theme: { colors: {}, typography: {} },
    })
  })
})
