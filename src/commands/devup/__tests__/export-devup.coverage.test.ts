import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import * as isVariableAliasModule from '../../../utils/is-variable-alias'
import * as variableAliasToValueModule from '../../../utils/variable-alias-to-value'
import { buildDevupConfig, collectVariableSources } from '../export-devup'

describe('export-devup branch coverage', () => {
  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  test('non-treeshaking loads other pages, recurses children, and drops an empty length map', async () => {
    // Nested child → exercises the walkBoundVars recursion.
    const nested = {
      id: 'nested',
      name: 'Nested',
      type: 'RECTANGLE',
      boundVariables: { fills: [{ id: 'v2' }] },
      children: [],
    }
    const node = {
      id: 'n1',
      name: 'Frame',
      type: 'FRAME',
      boundVariables: { fills: [{ id: 'v1' }] },
      children: [nested],
    }
    const page1 = { id: 'p1', children: [node] }
    // Second, non-current page → exercises the page.loadAsync() branch.
    const page2 = { id: 'p2', children: [], loadAsync: async () => {} }
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      skipInvisibleInstanceChildren: false,
      currentPage: page1,
      root: { children: [page1, page2] },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        // Bound vars resolve to null → contribute no length → the empty map is dropped.
        getVariableByIdAsync: async () => null,
      },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(false)
    expect(devup.theme?.length).toBeUndefined()
  })

  test('treeshaking walks children of text-search nodes for bound vars', async () => {
    const child = {
      id: 'c1',
      name: 'Child',
      type: 'RECTANGLE',
      boundVariables: { fills: [{ id: 'v1' }] },
      children: [],
    }
    const textSearchNode = {
      id: 'ts',
      name: 'Search',
      type: 'FRAME',
      findAllWithCriteria: () => [],
      children: [child],
    }
    const page = { id: 'p1', children: [textSearchNode] }
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      mixed: Symbol('mixed'),
      skipInvisibleInstanceChildren: false,
      currentPage: page,
      root: { children: [page] },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        getVariableByIdAsync: async () => null,
      },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(true)
    expect(devup.theme?.length).toBeUndefined()
  })

  test('resolves FLOAT length values that are variable aliases', async () => {
    const isAlias = spyOn(
      isVariableAliasModule,
      'isVariableAlias',
    ).mockReturnValue(true)
    const aliasToValue = spyOn(
      variableAliasToValueModule,
      'variableAliasToValue',
    ).mockResolvedValue(16)

    const floatVar = {
      name: 'radius',
      resolvedType: 'FLOAT',
      remote: false,
      variableCollectionId: 'coll',
      valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'aliased' } },
    }
    const node = {
      id: 'n1',
      name: 'Frame',
      type: 'FRAME',
      boundVariables: { paddingLeft: { id: 'v1' } },
      children: [],
    }
    const page = { id: 'p1', children: [node] }
    ;(globalThis as { figma?: unknown }).figma = {
      util: { rgba: (v: unknown) => v },
      mixed: Symbol('mixed'),
      skipInvisibleInstanceChildren: false,
      currentPage: page,
      root: { children: [page] },
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      variables: {
        getLocalVariableCollectionsAsync: async () => [],
        getVariableByIdAsync: async (id: string) =>
          id === 'v1' ? (floatVar as unknown as Variable) : null,
        getVariableCollectionByIdAsync: async (id: string) =>
          id === 'coll'
            ? ({
                modes: [{ modeId: 'm1', name: 'mobile' }],
              } as unknown as VariableCollection)
            : null,
      },
    } as unknown as typeof figma

    const devup = await buildDevupConfig(true)
    expect(devup.theme?.length?.default?.radius).toBe('16px')

    isAlias.mockRestore()
    aliasToValue.mockRestore()
  })

  test('collectVariableSources loads non-current pages, walks nested children, and annotates a bound local var', async () => {
    const localFloat = {
      name: 'gutter',
      resolvedType: 'FLOAT',
      remote: false,
      variableCollectionId: 'coll',
    }
    const nested = {
      id: 'nested',
      name: 'Nested',
      type: 'RECTANGLE',
      boundVariables: { fills: [{ id: 'g' }] },
      children: [],
    }
    const frame = {
      id: 'frame',
      name: 'Frame',
      type: 'FRAME',
      children: [nested],
    }
    const page1 = { id: 'p1', children: [frame] }
    const page2 = { id: 'p2', children: [], loadAsync: async () => {} }
    ;(globalThis as { figma?: unknown }).figma = {
      skipInvisibleInstanceChildren: false,
      currentPage: page1,
      root: { children: [page1, page2] },
      variables: {
        getLocalVariableCollectionsAsync: async () => [
          { id: 'coll', name: 'Sizes', variableIds: ['g'] },
        ],
        getVariableByIdAsync: async (id: string) =>
          id === 'g' ? (localFloat as unknown as Variable) : null,
        getVariableCollectionByIdAsync: async (id: string) =>
          id === 'coll'
            ? ({ id: 'coll', name: 'Sizes' } as unknown as VariableCollection)
            : null,
      },
    } as unknown as typeof figma

    const index = await collectVariableSources()
    // The local 'gutter' source is annotated with the node that binds it.
    expect(index.get('gutter')).toEqual([
      {
        collection: 'Sizes',
        originalName: 'gutter',
        category: 'length',
        boundNodeName: 'Nested',
      },
    ])
  })
})
