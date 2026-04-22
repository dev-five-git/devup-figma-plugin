import { describe, expect, test } from 'bun:test'

import type { NodeTree } from '../../types'
import {
  collectImportMetadataFromTree,
  mergeImportMetadata,
} from '../collect-import-metadata'

describe('collectImportMetadataFromTree', () => {
  test('collects devup imports, custom imports, keyframes, arrays, and slot metadata', () => {
    const tree: NodeTree = {
      component: 'Box',
      props: {
        animationName: 'keyframes({"0%":{"opacity":0}})',
        values: [
          'plain',
          {
            __imports: {
              devupImports: ['Text'],
              customImports: ['Status'],
              usesKeyframes: false,
            },
          },
        ],
      },
      children: [
        {
          component: 'CustomButton',
          props: {},
          children: [],
          nodeType: 'FRAME',
          nodeName: 'CustomButton',
        },
        {
          component: 'ignoredSlot',
          props: {},
          children: [],
          nodeType: 'SLOT',
          nodeName: 'Slot',
          isSlot: true,
        },
        {
          component: 'Fragment',
          props: {},
          children: [],
          nodeType: 'FRAME',
          nodeName: 'Fragment',
        },
      ],
      nodeType: 'FRAME',
      nodeName: 'Root',
    }

    const result = collectImportMetadataFromTree(tree, 'CurrentComponent')

    expect(result.devupImports).toEqual(['Box', 'Text'])
    expect(result.customImports).toEqual(['CustomButton', 'Status'])
    expect(result.usesKeyframes).toBe(true)
  })

  test('skips current component name from custom imports', () => {
    const tree: NodeTree = {
      component: 'Toast',
      props: {},
      children: [
        {
          component: 'Toast',
          props: {},
          children: [],
          nodeType: 'INSTANCE',
          nodeName: 'Toast',
        },
      ],
      nodeType: 'FRAME',
      nodeName: 'Toast',
    }

    const result = collectImportMetadataFromTree(tree, 'Toast')

    expect(result.customImports).toEqual([])
  })
})

describe('mergeImportMetadata', () => {
  test('merges and deduplicates import metadata', () => {
    const result = mergeImportMetadata([
      {
        devupImports: ['Box', 'Text'],
        customImports: ['Status'],
        usesKeyframes: false,
      },
      {
        devupImports: ['Box', 'Image'],
        customImports: ['Status', 'Button'],
        usesKeyframes: true,
      },
    ])

    expect(result.devupImports).toEqual(['Box', 'Image', 'Text'])
    expect(result.customImports).toEqual(['Button', 'Status'])
    expect(result.usesKeyframes).toBe(true)
  })
})
