import { afterAll, describe, expect, spyOn, test } from 'bun:test'

import * as checkAssetNodeModule from '../../codegen/utils/check-asset-node'
import type { ImportMetadata } from '../../codegen/utils/collect-import-metadata'
import {
  collectAssetNodes,
  DEVUP_COMPONENTS,
  extractCustomComponentImports,
  extractImports,
  generateImportStatements,
} from '../exportPagesAndComponents'

function componentCode(
  name: string,
  metadata: Partial<ImportMetadata>,
): readonly [string, string, ImportMetadata] {
  return [
    name,
    '',
    {
      devupImports: metadata.devupImports ?? [],
      customImports: metadata.customImports ?? [],
      usesKeyframes: metadata.usesKeyframes ?? false,
    },
  ]
}

const checkAssetNodeSpy = spyOn(
  checkAssetNodeModule,
  'checkAssetNode',
).mockImplementation(
  (node: { type: string; isAsset?: boolean }): 'svg' | 'png' | null => {
    if (node.type === 'VECTOR') return 'svg'
    if (node.type === 'STAR') return 'svg'
    if (node.type === 'POLYGON') return 'svg'
    if (node.isAsset && node.type === 'RECTANGLE') return 'png'
    return null
  },
)

afterAll(() => {
  checkAssetNodeSpy.mockRestore()
})

describe('DEVUP_COMPONENTS', () => {
  test('should contain expected devup-ui components', () => {
    expect(DEVUP_COMPONENTS).toContain('Box')
    expect(DEVUP_COMPONENTS).toContain('Flex')
    expect(DEVUP_COMPONENTS).toContain('Text')
    expect(DEVUP_COMPONENTS).toContain('Image')
    expect(DEVUP_COMPONENTS).toContain('Grid')
    expect(DEVUP_COMPONENTS).toContain('VStack')
    expect(DEVUP_COMPONENTS).toContain('Center')
  })
})

describe('extractImports', () => {
  test('should extract Box import', () => {
    const result = extractImports([
      componentCode('Test', { devupImports: ['Box'] }),
    ])
    expect(result).toContain('Box')
  })

  test('should extract multiple devup-ui components', () => {
    const result = extractImports([
      componentCode('Test', { devupImports: ['Box', 'Flex', 'Text'] }),
    ])
    expect(result).toContain('Box')
    expect(result).toContain('Flex')
    expect(result).toContain('Text')
  })

  test('should extract keyframes import', () => {
    const result = extractImports([
      componentCode('Test', {
        devupImports: ['Box'],
        usesKeyframes: true,
      }),
    ])
    expect(result).toContain('keyframes')
    expect(result).toContain('Box')
  })

  test('should not extract keyframes when not present', () => {
    const result = extractImports([
      componentCode('Test', { devupImports: ['Box'] }),
    ])
    expect(result).not.toContain('keyframes')
  })

  test('should return sorted imports', () => {
    const result = extractImports([
      componentCode('Test', { devupImports: ['VStack', 'Box', 'Center'] }),
    ])
    expect(result).toEqual(['Box', 'Center', 'VStack'])
  })

  test('should not include duplicates', () => {
    const result = extractImports([
      componentCode('Test1', { devupImports: ['Box'] }),
      componentCode('Test2', { devupImports: ['Box'] }),
    ])
    expect(result.filter((x) => x === 'Box').length).toBe(1)
  })
})

describe('extractCustomComponentImports', () => {
  test('should extract custom component', () => {
    const result = extractCustomComponentImports([
      componentCode('Test', { customImports: ['CustomButton'] }),
    ])
    expect(result).toContain('CustomButton')
  })

  test('should extract multiple custom components', () => {
    const result = extractCustomComponentImports([
      componentCode('Test', {
        customImports: ['CustomA', 'CustomB', 'CustomC'],
      }),
    ])
    expect(result).toContain('CustomA')
    expect(result).toContain('CustomB')
    expect(result).toContain('CustomC')
  })

  test('should not include devup-ui components', () => {
    const result = extractCustomComponentImports([
      componentCode('Test', {
        devupImports: ['Box', 'Flex'],
        customImports: ['CustomCard'],
      }),
    ])
    expect(result).toContain('CustomCard')
    expect(result).not.toContain('Box')
    expect(result).not.toContain('Flex')
  })

  test('should return sorted imports', () => {
    const result = extractCustomComponentImports([
      componentCode('Test', { customImports: ['Zebra', 'Apple', 'Mango'] }),
    ])
    expect(result).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  test('should not include duplicates', () => {
    const result = extractCustomComponentImports([
      componentCode('Test1', { customImports: ['SharedButton'] }),
      componentCode('Test2', { customImports: ['SharedButton'] }),
    ])
    expect(result.filter((x) => x === 'SharedButton').length).toBe(1)
  })

  test('should return empty array when no custom components', () => {
    const result = extractCustomComponentImports([
      componentCode('Test', { devupImports: ['Box', 'Flex'] }),
    ])
    expect(result).toEqual([])
  })
})

describe('collectAssetNodes', () => {
  let nodeIdCounter = 0
  function createNode(
    type: string,
    name: string,
    {
      visible = true,
      isAsset = false,
      children,
      id,
    }: {
      visible?: boolean
      isAsset?: boolean
      children?: SceneNode[]
      id?: string
    } = {},
  ): SceneNode {
    return {
      type,
      name,
      visible,
      isAsset,
      id: id ?? `node-${nodeIdCounter++}`,
      ...(children ? { children } : {}),
    } as unknown as SceneNode
  }

  test('should collect SVG asset node', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('VECTOR', 'arrow-icon')
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(1)
    expect(assets.get('svg/arrow-icon')?.type).toBe('svg')
  })

  test('should collect PNG asset node', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('RECTANGLE', 'photo', { isAsset: true })
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(1)
    expect(assets.get('png/photo')?.type).toBe('png')
  })

  test('should skip invisible nodes', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('VECTOR', 'hidden-icon', { visible: false })
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(0)
  })

  test('should recursively collect from children', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('FRAME', 'container', {
      children: [createNode('VECTOR', 'icon-a'), createNode('STAR', 'icon-b')],
    })
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(2)
    expect(assets.has('svg/icon-a')).toBe(true)
    expect(assets.has('svg/icon-b')).toBe(true)
  })

  test('should not descend into asset node children', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('VECTOR', 'icon-parent')
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(1)
  })

  test('should deduplicate by type and name', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('FRAME', 'wrapper', {
      children: [
        createNode('VECTOR', 'same-icon'),
        createNode('VECTOR', 'same-icon'),
      ],
    })
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(1)
  })

  test('should collect from nested frames', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('FRAME', 'outer', {
      children: [
        createNode('FRAME', 'inner', {
          children: [createNode('POLYGON', 'deep-icon')],
        }),
      ],
    })
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(1)
    expect(assets.has('svg/deep-icon')).toBe(true)
  })

  test('should collect both SVG and PNG assets', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('FRAME', 'mixed', {
      children: [
        createNode('VECTOR', 'icon'),
        createNode('RECTANGLE', 'image', { isAsset: true }),
      ],
    })
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(2)
    expect(assets.get('svg/icon')?.type).toBe('svg')
    expect(assets.get('png/image')?.type).toBe('png')
  })

  test('should return empty map for non-asset leaf node', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('FRAME', 'empty-frame')
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(0)
  })

  test('should skip already-visited nodes when visited set is provided', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const visited = new Set<string>()
    const sharedChild = createNode('VECTOR', 'shared-icon', { id: 'shared-1' })

    const parent1 = createNode('FRAME', 'parent-a', {
      children: [sharedChild],
    })
    collectAssetNodes(parent1, assets, visited)
    expect(assets.size).toBe(1)

    const parent2 = createNode('FRAME', 'parent-b', {
      children: [sharedChild],
    })
    collectAssetNodes(parent2, assets, visited)
    expect(assets.size).toBe(1)
    expect(visited.has('shared-1')).toBe(true)
  })

  test('should skip visited parent node entirely', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const visited = new Set<string>()
    const node = createNode('FRAME', 'root', {
      id: 'root-1',
      children: [createNode('VECTOR', 'icon-inside')],
    })

    collectAssetNodes(node, assets, visited)
    expect(assets.size).toBe(1)

    assets.clear()
    collectAssetNodes(node, assets, visited)
    expect(assets.size).toBe(0)
  })

  test('should work without visited set (backward compatible)', () => {
    const assets = new Map<string, { node: SceneNode; type: 'svg' | 'png' }>()
    const node = createNode('VECTOR', 'compat-icon')
    collectAssetNodes(node, assets)
    expect(assets.size).toBe(1)
  })
})

describe('generateImportStatements', () => {
  test('should generate devup-ui import statement', () => {
    const result = generateImportStatements([
      componentCode('Test', { devupImports: ['Box', 'Flex'] }),
    ])
    expect(result).toContain("import { Box, Flex } from '@devup-ui/react'")
  })

  test('should generate custom component import statements', () => {
    const result = generateImportStatements([
      componentCode('Test', {
        devupImports: ['Box'],
        customImports: ['CustomButton'],
      }),
    ])
    expect(result).toContain("import { Box } from '@devup-ui/react'")
    expect(result).toContain(
      "import { CustomButton } from '@/components/CustomButton'",
    )
  })

  test('should generate multiple custom component imports on separate lines', () => {
    const result = generateImportStatements([
      componentCode('Test', { customImports: ['ButtonA', 'ButtonB'] }),
    ])
    expect(result).toContain("import { ButtonA } from '@/components/ButtonA'")
    expect(result).toContain("import { ButtonB } from '@/components/ButtonB'")
  })

  test('should return empty string when no imports', () => {
    const result = generateImportStatements([componentCode('Test', {})])
    expect(result).toBe('')
  })

  test('should include keyframes in devup-ui import', () => {
    const result = generateImportStatements([
      componentCode('Test', {
        devupImports: ['Box'],
        usesKeyframes: true,
      }),
    ])
    expect(result).toContain('keyframes')
    expect(result).toContain("from '@devup-ui/react'")
  })

  test('should end with double newline when has imports', () => {
    const result = generateImportStatements([
      componentCode('Test', { devupImports: ['Box'] }),
    ])
    expect(result.endsWith('\n\n')).toBe(true)
  })

  test('should return the same imports across repeated calls', () => {
    const components = [
      componentCode('Test', {
        devupImports: ['Box', 'Flex'],
        customImports: ['CustomButton'],
      }),
    ] as const
    const first = generateImportStatements(components)
    const second = generateImportStatements(components)

    expect(second).toBe(first)
  })
})
