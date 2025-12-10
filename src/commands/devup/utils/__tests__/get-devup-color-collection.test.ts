import { describe, expect, it, mock, vi } from 'bun:test'
import { getDevupColorCollection } from '../get-devup-color-collection'

describe('getDevupColorCollection', () => {
  it('should get Devup Color Collection', async () => {
    const getLocalVariableCollectionsAsync = mock(() =>
      Promise.resolve([
        {
          name: 'Devup Colors',
        },
      ]),
    )
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getLocalVariableCollectionsAsync,
      },
    } as unknown as typeof figma
    getLocalVariableCollectionsAsync.mockResolvedValue([
      {
        name: 'Devup Colors',
      },
    ])
    expect(await getDevupColorCollection()).toEqual({
      name: 'Devup Colors',
    } as unknown as VariableCollection)
  })

  it('should return null if Devup Color Collection not found', async () => {
    const getLocalVariableCollectionsAsync = vi.fn()
    ;(globalThis as { figma?: unknown }).figma = {
      variables: {
        getLocalVariableCollectionsAsync,
      },
    } as unknown as typeof figma
    getLocalVariableCollectionsAsync.mockResolvedValue([])
    expect(await getDevupColorCollection()).toBeNull()
  })
})
