import { getDevupColorCollection } from '../get-devup-color-collection'

describe('getDevupColorCollection', () => {
  it('should get Devup Color Collection', async () => {
    const getLocalVariableCollectionsAsync = vi.fn()
    ;(globalThis as any).figma = {
      variables: {
        getLocalVariableCollectionsAsync,
      },
    } as any
    getLocalVariableCollectionsAsync.mockResolvedValue([
      {
        name: 'Devup Colors',
      },
    ])
    expect(await getDevupColorCollection()).toEqual({
      name: 'Devup Colors',
    })
  })

  it('should return null if Devup Color Collection not found', async () => {
    const getLocalVariableCollectionsAsync = vi.fn()
    ;(globalThis as any).figma = {
      variables: {
        getLocalVariableCollectionsAsync,
      },
    } as any
    getLocalVariableCollectionsAsync.mockResolvedValue([])
    expect(await getDevupColorCollection()).toBeNull()
  })
})
