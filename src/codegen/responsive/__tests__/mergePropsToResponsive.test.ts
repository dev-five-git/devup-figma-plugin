import { describe, expect, it } from 'bun:test'
import {
  type BreakpointKey,
  groupChildrenByBreakpoint,
  groupNodesByName,
  mergePropsToResponsive,
  type Props,
} from '../index'

describe('mergePropsToResponsive', () => {
  const cases: {
    name: string
    input: Map<BreakpointKey, Record<string, unknown>>
    expected: Record<string, unknown>
  }[] = [
    {
      name: 'returns props as-is for single breakpoint',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { width: '100px' }],
      ]),
      expected: { width: '100px' },
    },
    {
      name: 'keeps responsive array when values differ',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { width: '100px' }],
        ['sm', { width: '100px' }],
        ['tablet', { width: '120px' }],
      ]),
      expected: { width: ['100px', null, '120px'] },
    },
    {
      name: 'single pc breakpoint keeps value',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['pc', { display: 'block' }],
      ]),
      expected: { display: 'block' },
    },
    {
      name: 'multiple breakpoints with different values',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: 'block' }],
        ['sm', { display: 'none' }],
        ['tablet', { display: 'block' }],
        ['lg', { display: 'none' }],
        ['pc', { display: 'block' }],
      ]),
      expected: { display: ['block', 'none', 'block', 'none', 'block'] },
    },
    {
      name: 'multiple breakpoints with same values',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: 'block' }],
        ['sm', { display: 'block' }],
        ['tablet', { display: 'block' }],
        ['lg', { display: 'block' }],
        ['pc', { display: 'block' }],
      ]),
      expected: { display: 'block' },
    },
    {
      name: 'all breakpoints undefined values are omitted',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: undefined }],
        ['sm', { display: undefined }],
        ['tablet', { display: undefined }],
        ['lg', { display: undefined }],
        ['pc', { display: undefined }],
      ]),
      expected: {},
    },
    {
      name: 'all breakpoints null values are omitted',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: null }],
        ['sm', { display: null }],
        ['tablet', { display: null }],
        ['lg', { display: null }],
        ['pc', { display: null }],
      ]),
      expected: {},
    },
    {
      name: 'mix of null and undefined still omitted when no value',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: null }],
        ['sm', { display: undefined }],
        ['tablet', { display: undefined }],
        ['lg', { display: undefined }],
        ['pc', { display: undefined }],
      ]),
      expected: {},
    },
    {
      name: 'later breakpoint provides value after null/undefined',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { w: null }],
        ['sm', { w: undefined }],
        ['tablet', { w: '10px' }],
        ['lg', { w: undefined }],
        ['pc', { w: undefined }],
      ]),
      expected: {
        w: [null, null, '10px', 'initial'],
      },
    },
    {
      name: 'repeat value collapses to single when identical',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { w: '10px' }],
        ['sm', { w: undefined }],
        ['tablet', { w: '10px' }],
        ['lg', { w: undefined }],
        ['pc', { w: undefined }],
      ]),
      expected: {
        w: ['10px', null, null, 'initial'],
      },
    },
    {
      name: 'display value collapses to single when identical',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: null }],
        ['tablet', { display: 'none' }],
        ['pc', { display: undefined }],
      ]),
      expected: {
        display: [null, null, 'none', null, 'initial'],
      },
    },
    {
      name: 'display value collapses to single when identical',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: null }],
        ['tablet', { display: 'none' }],
        ['pc', { display: 'none' }],
      ]),
      expected: {
        display: [null, null, 'none'],
      },
    },
    {
      name: 'repeat value collapses to single when identical',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { pos: null }],
        ['tablet', { pos: 'absolute' }],
        ['pc', { pos: undefined }],
      ]),
      expected: {
        pos: [null, null, 'absolute', null, 'initial'],
      },
    },
    {
      name: 'mobile only value with tablet and pc breakpoints needs initial at tablet position',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { textAlign: 'center' }],
        ['tablet', { textAlign: undefined }],
        ['pc', { textAlign: undefined }],
      ]),
      expected: {
        textAlign: ['center', null, 'initial'],
      },
    },
    {
      name: 'display none at mobile, flex at tablet and pc should produce responsive array',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { display: 'none' }],
        ['tablet', { display: 'flex' }],
        ['pc', { display: 'flex' }],
      ]),
      expected: {
        display: ['none', null, 'flex'],
      },
    },
    {
      name: 'flexDir column at mobile, row at tablet and pc should produce responsive array',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { flexDir: 'column' }],
        ['tablet', { flexDir: 'row' }],
        ['pc', { flexDir: 'row' }],
      ]),
      expected: {
        flexDir: ['column', null, 'row'],
      },
    },
    {
      name: 'alignItems with default value at first should become null',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { alignItems: 'flex-start' }],
        ['tablet', { alignItems: 'center' }],
        ['pc', { alignItems: 'center' }],
      ]),
      expected: {
        alignItems: [null, null, 'center'],
      },
    },
    {
      name: 'justifyContent with default value at first should become null',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { justifyContent: 'flex-start' }],
        ['tablet', { justifyContent: 'center' }],
        ['pc', { justifyContent: 'center' }],
      ]),
      expected: {
        justifyContent: [null, null, 'center'],
      },
    },
    {
      name: 'flexDir with default value (row) at first should become null',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { flexDir: 'row' }],
        ['tablet', { flexDir: 'column' }],
        ['pc', { flexDir: 'column' }],
      ]),
      expected: {
        flexDir: [null, null, 'column'],
      },
    },
    {
      name: 'all default values should be omitted (empty result)',
      input: new Map<BreakpointKey, Record<string, unknown>>([
        ['mobile', { alignItems: 'flex-start', justifyContent: 'flex-start' }],
        ['tablet', { alignItems: 'flex-start', justifyContent: 'flex-start' }],
        ['pc', { alignItems: 'flex-start', justifyContent: 'flex-start' }],
      ]),
      expected: {},
    },
  ]

  cases.forEach(({ name, input, expected }) => {
    it(name, () => {
      expect(
        mergePropsToResponsive(input as unknown as Map<BreakpointKey, Props>),
      ).toEqual(expected as unknown as Props)
    })
  })
})

describe('responsive grouping helpers', () => {
  it('groups children by breakpoint without reallocating existing buckets', () => {
    const children = [
      { width: 320, name: 'mobile-a' },
      { width: 360, name: 'mobile-b' },
      { width: 1200, name: 'desktop-a' },
    ] as unknown as SceneNode[]

    const groups = groupChildrenByBreakpoint(children)

    expect(groups.get('mobile')?.map((child) => child.name)).toEqual([
      'mobile-a',
      'mobile-b',
    ])
    expect(groups.get('lg')?.map((child) => child.name)).toEqual(['desktop-a'])
  })

  it('replaces boxShadow with __boxShadowToken when single breakpoint', () => {
    const result = mergePropsToResponsive(
      new Map([
        [
          'pc' as BreakpointKey,
          {
            boxShadow: '0 16px 24px 0 $shadow',
            __boxShadowToken: '$testShadow',
          },
        ],
      ]),
    )
    expect(result.boxShadow).toBe('$testShadow')
    expect(result.__boxShadowToken).toBeUndefined()
  })

  it('replaces boxShadow with __boxShadowToken when all breakpoints collapse', () => {
    const result = mergePropsToResponsive(
      new Map([
        [
          'mobile' as BreakpointKey,
          {
            boxShadow: '0 16px 24px 0 $shadow',
            __boxShadowToken: '$testShadow',
          },
        ],
        [
          'pc' as BreakpointKey,
          {
            boxShadow: '0 16px 24px 0 $shadow',
            __boxShadowToken: '$testShadow',
          },
        ],
      ]),
    )
    expect(result.boxShadow).toBe('$testShadow')
    expect(result.__boxShadowToken).toBeUndefined()
  })

  it('replaces per-element token in responsive array', () => {
    const result = mergePropsToResponsive(
      new Map([
        ['mobile' as BreakpointKey, { boxShadow: '0 8px 16px 0 $shadow' }],
        [
          'pc' as BreakpointKey,
          {
            boxShadow: '0 16px 24px 0 $shadow',
            __boxShadowToken: '$testShadow',
          },
        ],
      ]),
    )
    // PC element replaced with token, mobile stays raw
    expect(result.boxShadow).toEqual([
      '0 8px 16px 0 $shadow',
      null,
      null,
      null,
      '$testShadow',
    ])
    expect(result.__boxShadowToken).toBeUndefined()
  })

  it('replaces textShadow with __textShadowToken when single breakpoint', () => {
    const result = mergePropsToResponsive(
      new Map([
        [
          'pc' as BreakpointKey,
          {
            textShadow: '0 4px 8px $shadow',
            __textShadowToken: '$titleShadow',
          },
        ],
      ]),
    )

    expect(result.textShadow).toBe('$titleShadow')
    expect(result.__textShadowToken).toBeUndefined()
  })

  it('replaces per-element textShadow token in responsive array', () => {
    const result = mergePropsToResponsive(
      new Map([
        ['mobile' as BreakpointKey, { textShadow: '0 2px 4px $shadow' }],
        [
          'pc' as BreakpointKey,
          {
            textShadow: '0 6px 12px $shadow',
            __textShadowToken: '$titleShadow',
          },
        ],
      ]),
    )

    expect(result.textShadow).toEqual([
      '0 2px 4px $shadow',
      null,
      null,
      null,
      '$titleShadow',
    ])
    expect(result.__textShadowToken).toBeUndefined()
  })

  it('groups nodes by name across breakpoints', () => {
    const breakpointNodes = new Map<BreakpointKey, SceneNode[]>([
      [
        'mobile',
        [{ name: 'Card' } as SceneNode, { name: 'Badge' } as SceneNode],
      ],
      ['pc', [{ name: 'Card' } as SceneNode]],
    ])

    const groups = groupNodesByName(breakpointNodes)

    expect(groups.get('Card')).toHaveLength(2)
    expect(groups.get('Badge')).toHaveLength(1)
  })
})
