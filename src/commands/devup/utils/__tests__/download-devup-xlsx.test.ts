import { describe, expect, mock, test } from 'bun:test'
import { downloadDevupXlsx } from '../download-devup-xlsx'

describe('downloadDevupXlsx', () => {
  function createMockFigma() {
    const showUIMock = mock(() => {})
    const postMessageMock = mock(() => {})
    const notifyMock = mock(() => {})
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
      notify: notifyMock,
    } as unknown as typeof figma

    return {
      ctx,
      showUIMock,
      postMessageMock,
      notifyMock,
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

  test('notifies when the iframe reports a failure instead of closing silently', async () => {
    const { ctx, getHandler, notifyMock } = createMockFigma()
    const promise = downloadDevupXlsx('devup.xlsx', '{}', ctx)

    getHandler()?.('cannot write workbook')

    await promise
    expect(notifyMock).toHaveBeenCalledWith(
      'Failed to export devup.xlsx: cannot write workbook',
      { error: true },
    )
  })
})

class FakeBlob {}

/**
 * Execute the serialized iframe script for real, against stubbed browser
 * globals, so the download path is regression-tested instead of only being
 * asserted as an HTML string.
 */
function runDownloadIframe(
  html: string,
  data: string,
  options: { writeXLSX?: () => unknown } = {},
) {
  const body = html.split('<script>')[1].split('</script>')[0]
  const aoaCalls: unknown[][][] = []
  const posted: { pluginMessage?: unknown }[] = []
  const clicked: string[] = []
  const anchor = {
    href: '',
    download: '',
    click: () => {
      clicked.push(anchor.download)
    },
  }

  const factory = new Function(
    'globalThis',
    'window',
    'document',
    'URL',
    'Blob',
    `var onmessage; ${body}; return onmessage;`,
  ) as unknown as (
    fakeGlobalThis: unknown,
    fakeWindow: unknown,
    fakeDocument: unknown,
    fakeUrl: unknown,
    fakeBlob: unknown,
  ) => (event: unknown) => void

  const handler = factory(
    {
      XLSX: {
        utils: {
          book_new: () => ({ SheetNames: [], Sheets: {} }),
          aoa_to_sheet: (aoa: unknown[][]) => {
            aoaCalls.push(aoa)
            return aoa
          },
        },
        writeXLSX: options.writeXLSX ?? (() => new Uint8Array([1])),
      },
    },
    {
      parent: {
        postMessage: (message: { pluginMessage?: unknown }) => {
          posted.push(message)
        },
      },
    },
    { createElement: () => anchor },
    { createObjectURL: () => 'blob:devup', revokeObjectURL: () => {} },
    FakeBlob,
  )

  handler({ data: { pluginMessage: { fileName: 'devup.xlsx', data } } })
  return { aoaCalls, clicked, posted }
}

describe('downloadDevupXlsx iframe script', () => {
  const showUIMock = mock(() => {})
  const ctx = {
    showUI: showUIMock,
    ui: { onmessage: undefined, postMessage: () => {} },
  } as unknown as typeof figma

  function iframeHtml(): string {
    showUIMock.mockClear()
    downloadDevupXlsx('devup.xlsx', '{}', ctx)
    return (showUIMock.mock.calls[0] as unknown as [string])[0]
  }

  test('writes both sheets and answers without an error', () => {
    const { aoaCalls, clicked, posted } = runDownloadIframe(
      iframeHtml(),
      JSON.stringify({
        theme: {
          colors: { light: { primary: '#000' } },
          typography: { heading: { fontFamily: 'Inter', fontSize: '24px' } },
        },
      }),
    )

    expect(aoaCalls[0]).toEqual([
      ['Theme', 'light'],
      ['primary', '#000'],
    ])
    expect(aoaCalls[1][1]).toEqual([
      'heading',
      0,
      'Inter',
      undefined,
      undefined,
      '24px',
      undefined,
      undefined,
    ])
    expect(clicked).toEqual(['devup.xlsx'])
    expect(posted).toEqual([{ pluginMessage: undefined }])
  })

  test('exports a file that has no color variables', () => {
    const { aoaCalls, clicked, posted } = runDownloadIframe(
      iframeHtml(),
      JSON.stringify({
        theme: { typography: { heading: [null, { fontSize: '16px' }] } },
      }),
    )

    // Header row only — an absent `colors` must not abort the export.
    expect(aoaCalls[0]).toEqual([['Theme']])
    expect(aoaCalls[1][1]).toEqual([
      'heading',
      1,
      undefined,
      undefined,
      undefined,
      '16px',
      undefined,
      undefined,
    ])
    expect(clicked).toEqual(['devup.xlsx'])
    expect(posted).toEqual([{ pluginMessage: undefined }])
  })

  test('exports a file that has no text styles', () => {
    const { aoaCalls, clicked, posted } = runDownloadIframe(
      iframeHtml(),
      JSON.stringify({ theme: { colors: { light: { primary: '#000' } } } }),
    )

    expect(aoaCalls[1]).toHaveLength(1)
    expect(clicked).toEqual(['devup.xlsx'])
    expect(posted).toEqual([{ pluginMessage: undefined }])
  })

  test('exports an empty config', () => {
    const { aoaCalls, clicked, posted } = runDownloadIframe(iframeHtml(), '{}')

    expect(aoaCalls[0]).toEqual([['Theme']])
    expect(aoaCalls[1]).toHaveLength(1)
    expect(clicked).toEqual(['devup.xlsx'])
    expect(posted).toEqual([{ pluginMessage: undefined }])
  })

  test('answers with the error instead of leaving the plugin pending', () => {
    const { clicked, posted } = runDownloadIframe(iframeHtml(), '{}', {
      writeXLSX: () => {
        throw new Error('cannot write workbook')
      },
    })

    expect(clicked).toEqual([])
    expect(posted).toEqual([{ pluginMessage: 'cannot write workbook' }])
  })
})
