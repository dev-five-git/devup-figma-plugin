import { describe, expect, mock, test } from 'bun:test'
import type { Devup } from '../../types'
import { uploadDevupXlsx } from '../upload-devup-xlsx'

describe('uploadDevupXlsx', () => {
  function createMockFigma() {
    const showUIMock = mock(() => {})
    const closeMock = mock(() => {})
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
    } as unknown as typeof figma

    return { ctx, showUIMock, closeMock, getHandler: () => onmessageHandler }
  }

  test('should call showUI with correct HTML string', () => {
    const { ctx, showUIMock } = createMockFigma()
    uploadDevupXlsx(ctx)
    expect(showUIMock).toHaveBeenCalledWith(
      expect.stringContaining('accept=".xlsx"'),
    )
    expect(showUIMock).toHaveBeenCalledWith(
      expect.stringContaining('xlsx-0.20.3'),
    )
  })

  test('should resolve with parsed JSON when message is received', async () => {
    const { ctx, closeMock, getHandler } = createMockFigma()
    const testData = { theme: { colors: {}, typography: {} } }
    const promise = uploadDevupXlsx(ctx)

    // Simulate message from UI
    const handler = getHandler()
    if (handler) {
      handler(JSON.stringify(testData))
    }

    const result = await promise
    expect(closeMock).toHaveBeenCalled()
    expect(result).toEqual(testData)
  })

  test('should handle message with colors and typography', async () => {
    const { ctx, getHandler } = createMockFigma()
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
  })
})
