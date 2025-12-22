import { describe, expect, it } from 'vitest'
import { findPageRoot } from '../find-page-root'

describe('findPageRoot', () => {
  it('should return node when parent type is PAGE', () => {
    const node = {
      type: 'FRAME',
      parent: { type: 'PAGE' },
    } as any

    const result = findPageRoot(node)
    expect(result).toBe(node)
  })

  it('should return node when parent type is SECTION', () => {
    const node = {
      type: 'FRAME',
      parent: { type: 'SECTION' },
    } as any

    const result = findPageRoot(node)
    expect(result).toBe(node)
  })

  it('should return node when parent type is COMPONENT_SET', () => {
    const node = {
      type: 'COMPONENT',
      parent: { type: 'COMPONENT_SET' },
    } as any

    const result = findPageRoot(node)
    expect(result).toBe(node)
  })

  it('should traverse up until finding page root', () => {
    const pageRootNode = {
      type: 'FRAME',
      parent: { type: 'PAGE' },
    } as any

    const middleNode = {
      type: 'FRAME',
      parent: pageRootNode,
    } as any

    const leafNode = {
      type: 'FRAME',
      parent: middleNode,
    } as any

    const result = findPageRoot(leafNode)
    expect(result).toBe(pageRootNode)
  })

  it('should traverse through multiple levels to find page root', () => {
    const pageRootNode = {
      type: 'FRAME',
      parent: { type: 'SECTION' },
    } as any

    const level1 = {
      type: 'FRAME',
      parent: pageRootNode,
    } as any

    const level2 = {
      type: 'FRAME',
      parent: level1,
    } as any

    const level3 = {
      type: 'FRAME',
      parent: level2,
    } as any

    const result = findPageRoot(level3)
    expect(result).toBe(pageRootNode)
  })
})
