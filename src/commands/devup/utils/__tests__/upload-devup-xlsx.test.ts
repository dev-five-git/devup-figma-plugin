import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Devup } from '../../types'
import { uploadDevupXlsx } from '../upload-devup-xlsx'

describe('uploadDevupXlsx', () => {
  let showUIMock: ReturnType<typeof mock>
  let closeMock: ReturnType<typeof mock>
  let onmessageHandler: ((message: string) => void) | null = null

  beforeEach(() => {
    showUIMock = mock(() => {})
    closeMock = mock(() => {})
    onmessageHandler = null

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

    ;(globalThis as { figma?: unknown }).figma = {
      showUI: showUIMock,
      ui: uiObj,
    } as unknown as typeof figma
  })

  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  test('should call showUI with correct HTML string', () => {
    uploadDevupXlsx()
    expect(showUIMock).toHaveBeenCalledWith(
      expect.stringContaining('accept=".xlsx"'),
    )
    expect(showUIMock).toHaveBeenCalledWith(
      expect.stringContaining('xlsx-0.20.3'),
    )
  })

  test('should resolve with parsed JSON when message is received', async () => {
    const testData = { theme: { colors: {}, typography: {} } }
    const promise = uploadDevupXlsx()

    // Simulate message from UI
    if (onmessageHandler) {
      onmessageHandler(JSON.stringify(testData))
    }

    const result = await promise
    expect(closeMock).toHaveBeenCalled()
    expect(result).toEqual(testData)
  })

  test('should handle message with colors and typography', async () => {
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
    const promise = uploadDevupXlsx()

    if (onmessageHandler) {
      onmessageHandler(JSON.stringify(testData))
    }

    const result = await promise
    expect(result).toEqual(testData as unknown as Devup)
  })
})
