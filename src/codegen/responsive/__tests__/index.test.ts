import { describe, expect, it } from 'bun:test'
import {
  getBreakpointByWidth,
  groupChildrenByBreakpoint,
  groupNodesByName,
  optimizeResponsiveValue,
} from '../index'

describe('responsive index helpers', () => {
  it('maps width to breakpoint boundaries', () => {
    expect(getBreakpointByWidth(320)).toBe('mobile')
    expect(getBreakpointByWidth(768)).toBe('sm')
    expect(getBreakpointByWidth(991)).toBe('tablet')
    expect(getBreakpointByWidth(1280)).toBe('lg')
    expect(getBreakpointByWidth(1600)).toBe('pc')
  })

  it('groups children by breakpoint', () => {
    const mobileNode = { width: 320 } as unknown as SceneNode
    const tabletNode = { width: 900 } as unknown as SceneNode
    const groups = groupChildrenByBreakpoint([mobileNode, tabletNode])

    expect(groups.get('mobile')).toEqual([mobileNode])
    expect(groups.get('tablet')).toEqual([tabletNode])
  })

  it('optimizes responsive values by collapsing duplicates and trimming', () => {
    expect(optimizeResponsiveValue(['200px', '200px', '100px', null])).toEqual([
      '200px',
      null,
      '100px',
    ])
    expect(optimizeResponsiveValue([null, null, null])).toBeNull()
    expect(optimizeResponsiveValue(['80px', null, null])).toBe('80px')
  })

  it('groups nodes by name for responsive matching', () => {
    const mobile = { name: 'Header' } as unknown as SceneNode
    const tablet = { name: 'Header' } as unknown as SceneNode
    const groups = groupNodesByName(
      new Map([
        ['mobile', [mobile]],
        ['tablet', [tablet]],
      ]),
    )

    expect(groups.get('Header')).toEqual([
      { breakpoint: 'mobile', node: mobile, props: {} },
      { breakpoint: 'tablet', node: tablet, props: {} },
    ])
  })

  it('handles object equality and empty optimized array', () => {
    const obj = { a: 1 }
    const optimized = optimizeResponsiveValue([
      obj,
      { a: 1 },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ])
    expect(optimized).toEqual(obj)
  })
})
