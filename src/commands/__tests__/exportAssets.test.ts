import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test'
import { Codegen } from '../../codegen/Codegen'
import { exportAssets } from '../exportAssets'

const runMock = mock(() => Promise.resolve())
let constructedNodes: SceneNode[] = []

const originalCodegen = Codegen

const notifyMock = mock(() => {})
beforeEach(() => {
  mock.module('../../codegen/Codegen', () => ({
    Codegen: class {
      constructor(node: SceneNode) {
        constructedNodes.push(node)
      }
      run = runMock
    },
  }))
  runMock.mockClear()
  constructedNodes = []
  ;(globalThis as { figma?: unknown }).figma = {
    currentPage: { selection: [] },
    notify: notifyMock,
  } as unknown as typeof figma
})

afterAll(() => {
  ;(globalThis as { figma?: unknown }).figma = undefined
  notifyMock.mockClear()
  mock.module('../../codegen/Codegen', () => ({
    Codegen: originalCodegen,
  }))
})
describe('exportAssets', () => {
  test('runs Codegen for each selected node', async () => {
    const selection = [
      { id: '1' } as unknown as SceneNode,
      { id: '2' } as unknown as SceneNode,
    ]
    ;(
      (globalThis as { figma?: { currentPage?: { selection?: SceneNode[] } } })
        .figma?.currentPage as { selection: SceneNode[] }
    ).selection = selection

    await exportAssets()

    expect(notifyMock).toHaveBeenCalledWith('Exporting assets...')
    expect(runMock).toHaveBeenCalledTimes(2)
    expect(constructedNodes).toEqual(selection)
  })

  test('handles empty selection', async () => {
    await exportAssets()

    expect(notifyMock).toHaveBeenCalledWith('Exporting assets...')
    expect(runMock).not.toHaveBeenCalled()
  })
})
