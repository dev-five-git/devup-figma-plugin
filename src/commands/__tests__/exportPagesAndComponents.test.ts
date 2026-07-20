import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import JSZipBinding from 'jszip'

import * as CodegenModule from '../../codegen/Codegen'
import * as ResponsiveCodegenModule from '../../codegen/responsive/ResponsiveCodegen'
import * as checkAssetNodeModule from '../../codegen/utils/check-asset-node'
import type { ImportMetadata } from '../../codegen/utils/collect-import-metadata'
import * as perfModule from '../../codegen/utils/perf'
import * as downloadFileModule from '../../utils/download-file'
import * as devupModule from '../devup'
import {
  collectAssetNodes,
  collectSectionNotes,
  DEVUP_COMPONENTS,
  exportPagesAndComponents,
  extractCustomComponentImports,
  extractImports,
  generateImportStatements,
} from '../exportPagesAndComponents'

const RealJSZip =
  require('../../../node_modules/jszip/dist/jszip.js') as typeof import('jszip')
type ZipInternals = InstanceType<typeof RealJSZip> & {
  comment: string | null
  root: string
}

beforeEach(() => {
  if (typeof JSZipBinding.prototype.folder === 'function') return

  // Another test globally replaces jszip. Repair that constructor with the real prototype.
  for (const method of ['file', 'generateAsync']) {
    Reflect.deleteProperty(JSZipBinding.prototype, method)
  }
  Object.setPrototypeOf(JSZipBinding.prototype, RealJSZip.prototype)
  Object.defineProperties(JSZipBinding.prototype, {
    root: { value: '', writable: true },
    comment: { value: null, writable: true },
    clone: {
      value: function (this: ZipInternals) {
        const clone = new RealJSZip() as ZipInternals
        clone.files = this.files
        clone.comment = this.comment
        clone.root = this.root
        return clone
      },
    },
  })
})

const restoreCallbacks: Array<() => void> = []

function trackSpy<T extends { mockRestore(): void }>(spy: T): T {
  restoreCallbacks.push(() => spy.mockRestore())
  return spy
}

afterEach(() => {
  for (const restore of restoreCallbacks.splice(0).reverse()) restore()
})

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

describe('collectSectionNotes', () => {
  test('combines non-empty direct text and descendant annotations', () => {
    const annotatedNodes = [
      {
        type: 'FRAME',
        name: 'Card',
        annotations: [
          { label: ' Use the compact variant ' },
          { label: '   ', labelMarkdown: 'ignored fallback' },
        ],
      },
      {
        type: 'RECTANGLE',
        name: 'Hero image',
        annotations: [{ labelMarkdown: 'Maintain the aspect ratio' }],
      },
      { type: 'FRAME', name: 'Unannotated' },
    ] as unknown as SceneNode[]
    const section = {
      type: 'SECTION',
      children: [
        { type: 'TEXT', characters: '  Introductory note  ' },
        { type: 'TEXT', characters: '   ' },
        { type: 'FRAME' },
      ],
      findAll: (predicate: (node: SceneNode) => boolean) =>
        annotatedNodes.filter(predicate),
    } as unknown as SectionNode

    expect(collectSectionNotes(section)).toBe(
      'Introductory note\n[Card] Use the compact variant\n[Hero image] Maintain the aspect ratio',
    )
  })

  test('returns an empty string when the section has no notes', () => {
    const descendants = [
      { type: 'FRAME', name: 'Plain frame' },
      { type: 'FRAME', name: 'Empty annotations', annotations: [] },
    ] as unknown as SceneNode[]
    const section = {
      type: 'SECTION',
      children: [{ type: 'TEXT', characters: '\n  ' }],
      findAll: (predicate: (node: SceneNode) => boolean) =>
        descendants.filter(predicate),
    } as unknown as SectionNode

    expect(collectSectionNotes(section)).toBe('')
  })
})

type NodeOverrides = Record<string, unknown>

let orchestrationNodeId = 0
function createOrchestrationNode(
  type: SceneNode['type'],
  name: string,
  overrides: NodeOverrides = {},
): SceneNode {
  return {
    type,
    name,
    id: `orchestration-node-${orchestrationNodeId++}`,
    visible: true,
    children: [],
    parent: null,
    findAll: () => [],
    exportAsync: mock(async () => new Uint8Array([1, 2, 3])),
    ...overrides,
  } as unknown as SceneNode
}

function installFigmaPage(
  selection: readonly SceneNode[],
  children: readonly SceneNode[] = selection,
) {
  const cancelMock = mock(() => {})
  const notifyMock = mock(() => ({ cancel: cancelMock }))
  ;(globalThis as { figma?: unknown }).figma = {
    currentPage: {
      selection,
      children,
      name: 'Marketing',
    },
    notify: notifyMock,
  } as unknown as typeof figma
  return { cancelMock, notifyMock }
}

const generatedImports: ImportMetadata = {
  devupImports: ['Box'],
  customImports: [],
  usesKeyframes: false,
}

describe('exportPagesAndComponents', () => {
  test('exports components, pages, notes, screenshots, and assets into a real zip', async () => {
    const screenshotError = new Error('screenshot failed')
    const assetError = new Error('asset failed')
    const componentSet = createOrchestrationNode(
      'COMPONENT_SET',
      'button set',
      {
        id: 'component-set-a',
        exportAsync: mock(async () => Promise.reject(screenshotError)),
      },
    ) as ComponentSetNode
    const componentInSet = createOrchestrationNode(
      'COMPONENT',
      'button child',
      {
        parent: componentSet,
      },
    )
    const nestedComponentSet = createOrchestrationNode(
      'COMPONENT_SET',
      'nested set',
      { id: 'component-set-b' },
    ) as ComponentSetNode
    const nestedComponent = createOrchestrationNode(
      'COMPONENT',
      'nested child',
      { parent: nestedComponentSet },
    )
    const annotatedDescendants = [
      {
        type: 'FRAME',
        name: 'Content',
        annotations: [{ labelMarkdown: 'Keep this content concise' }],
      },
    ] as unknown as SceneNode[]
    const section = createOrchestrationNode('SECTION', 'landing page', {
      children: [
        { type: 'TEXT', characters: ' Page owner: Growth ' },
        { type: 'TEXT', characters: '   ' },
      ],
      findAll: (predicate: (node: SceneNode) => boolean) =>
        annotatedDescendants.filter(predicate),
    }) as SectionNode
    const parentSection = createOrchestrationNode(
      'SECTION',
      'account details',
      {
        children: [],
        findAll: () => [],
      },
    ) as SectionNode
    const childOfSection = createOrchestrationNode('FRAME', 'account content', {
      parent: parentSection,
    })
    const svgAsset = createOrchestrationNode('VECTOR', 'check')
    const pngAsset = createOrchestrationNode('RECTANGLE', 'portrait')
    const failedAsset = createOrchestrationNode('RECTANGLE', 'broken', {
      exportAsync: mock(async () => Promise.reject(assetError)),
    })
    const assetNodes = new Map([
      ['svg/check', { node: svgAsset, type: 'svg' as const }],
      ['png/portrait', { node: pngAsset, type: 'png' as const }],
      ['png/broken', { node: failedAsset, type: 'png' as const }],
    ])
    const { notifyMock } = installFigmaPage([
      componentSet,
      componentInSet,
      section,
      childOfSection,
    ])
    let downloadedData: Uint8Array | undefined

    trackSpy(
      spyOn(devupModule, 'buildDevupConfig').mockImplementation(async () => ({
        theme: {},
      })),
    )
    trackSpy(
      spyOn(CodegenModule, 'resetGlobalAssetNodes').mockImplementation(
        () => {},
      ),
    )
    trackSpy(
      spyOn(CodegenModule, 'getGlobalAssetNodes').mockReturnValue(assetNodes),
    )
    trackSpy(
      spyOn(CodegenModule.Codegen.prototype, 'run').mockResolvedValue(''),
    )
    trackSpy(
      spyOn(CodegenModule.Codegen.prototype, 'getComponentsCodes')
        .mockReturnValueOnce([
          [
            'InlineCard',
            'export const InlineCard = () => <Box />',
            generatedImports,
          ],
        ])
        .mockReturnValueOnce([]),
    )
    trackSpy(
      spyOn(CodegenModule.Codegen.prototype, 'getComponentNodes')
        .mockReturnValueOnce([nestedComponent])
        .mockReturnValueOnce([]),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen,
        'generateVariantResponsiveComponents',
      ).mockImplementation(async (_node, componentName) => [
        [
          componentName,
          `export const ${componentName} = () => <Box />`,
          generatedImports,
        ],
      ]),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen,
        'canGenerateResponsive',
      ).mockImplementation((node): node is SectionNode => node === section),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen,
        'hasParentSection',
      ).mockImplementation((node) =>
        node === childOfSection ? parentSection : null,
      ),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen.prototype,
        'generateResponsiveResult',
      ).mockResolvedValue({ code: '<Box />', imports: generatedImports }),
    )
    trackSpy(spyOn(perfModule, 'perfStart').mockReturnValue(0))
    trackSpy(spyOn(perfModule, 'perfEnd').mockImplementation(() => {}))
    trackSpy(spyOn(perfModule, 'perfReset').mockImplementation(() => {}))
    trackSpy(
      spyOn(perfModule, 'perfReport').mockReturnValue('performance report'),
    )
    const nowValues = [1000, 1000, 1200, 1200, 1400, 1400, 1600, 1600]
    let nowIndex = 0
    trackSpy(
      spyOn(Date, 'now').mockImplementation(
        () => nowValues[nowIndex++] ?? nowValues[nowValues.length - 1],
      ),
    )
    const consoleErrorSpy = trackSpy(
      spyOn(console, 'error').mockImplementation(() => {}),
    )
    trackSpy(spyOn(console, 'info').mockImplementation(() => {}))
    const downloadSpy = trackSpy(
      spyOn(downloadFileModule, 'downloadFile').mockImplementation(
        async (_fileName, data) => {
          if (data instanceof Uint8Array) downloadedData = data
        },
      ),
    )

    await exportPagesAndComponents()

    expect(downloadSpy).toHaveBeenCalledWith(
      'Marketing-export.zip',
      expect.any(Uint8Array),
    )
    expect(downloadedData).toBeInstanceOf(Uint8Array)
    if (!downloadedData) throw new Error('Expected generated zip data')
    const zip = await RealJSZip.loadAsync(downloadedData)
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        'components/ButtonSet.tsx',
        'components/NestedSet.tsx',
        'components/InlineCard.tsx',
        'pages/LandingPage.tsx',
        'pages/LandingPage.txt',
        'pages/LandingPage.png',
        'pages/AccountDetailsPage.tsx',
        'pages/AccountDetailsPage.png',
        'icons/check.svg',
        'images/portrait.png',
        'devup.json',
      ]),
    )
    expect(zip.file('pages/AccountDetailsPage.txt')).toBeNull()
    expect(zip.file('components/ButtonSet.png')).toBeNull()
    expect(zip.file('images/broken.png')).toBeNull()
    expect(await zip.file('pages/LandingPage.txt')?.async('string')).toBe(
      'Page owner: Growth\n[Content] Keep this content concise',
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to capture screenshot for ButtonSet.png:',
      screenshotError,
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to export asset broken:',
      assetError,
    )
    expect(notifyMock).toHaveBeenCalledWith(
      'Exported 3 components, 2 pages, 2 assets',
      { timeout: 3000 },
    )
    expect(notifyMock).toHaveBeenCalledWith(
      expect.stringContaining('Exporting ['),
      { timeout: Infinity },
    )
    expect(nowIndex).toBe(8)
  })

  test('uses page children and returns when no components or pages are found', async () => {
    const node = createOrchestrationNode('FRAME', 'plain frame')
    const { notifyMock, cancelMock } = installFigmaPage([], [node])
    const buildSpy = trackSpy(
      spyOn(devupModule, 'buildDevupConfig').mockResolvedValue({ theme: {} }),
    )
    trackSpy(
      spyOn(CodegenModule, 'resetGlobalAssetNodes').mockImplementation(
        () => {},
      ),
    )
    trackSpy(
      spyOn(CodegenModule.Codegen.prototype, 'run').mockResolvedValue(''),
    )
    trackSpy(
      spyOn(
        CodegenModule.Codegen.prototype,
        'getComponentsCodes',
      ).mockReturnValue([]),
    )
    trackSpy(
      spyOn(
        CodegenModule.Codegen.prototype,
        'getComponentNodes',
      ).mockReturnValue([]),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen,
        'canGenerateResponsive',
      ).mockReturnValue(false),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen,
        'hasParentSection',
      ).mockReturnValue(null),
    )
    trackSpy(spyOn(Date, 'now').mockReturnValue(1000))

    await exportPagesAndComponents()

    expect(buildSpy).toHaveBeenCalledTimes(1)
    expect(cancelMock).toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith('No components or pages found')
  })

  test('exports successfully without adding an asset count to the notification', async () => {
    const componentSet = createOrchestrationNode('COMPONENT_SET', 'badge', {
      id: 'badge-set',
    }) as ComponentSetNode
    const { notifyMock } = installFigmaPage([componentSet])
    trackSpy(
      spyOn(devupModule, 'buildDevupConfig').mockResolvedValue({ theme: {} }),
    )
    trackSpy(
      spyOn(CodegenModule, 'resetGlobalAssetNodes').mockImplementation(
        () => {},
      ),
    )
    trackSpy(
      spyOn(CodegenModule, 'getGlobalAssetNodes').mockReturnValue(new Map()),
    )
    trackSpy(
      spyOn(
        ResponsiveCodegenModule.ResponsiveCodegen,
        'generateVariantResponsiveComponents',
      ).mockResolvedValue([
        ['Badge', 'export const Badge = () => <Box />', generatedImports],
      ]),
    )
    trackSpy(spyOn(Date, 'now').mockReturnValue(1000))
    trackSpy(spyOn(console, 'info').mockImplementation(() => {}))
    const downloadSpy = trackSpy(
      spyOn(downloadFileModule, 'downloadFile').mockResolvedValue(undefined),
    )

    await exportPagesAndComponents()

    expect(downloadSpy).toHaveBeenCalledWith(
      'Marketing-export.zip',
      expect.any(Uint8Array),
    )
    expect(notifyMock).toHaveBeenCalledWith('Exported 1 components, 0 pages', {
      timeout: 3000,
    })
  })

  test('notifies an error when orchestration throws', async () => {
    const node = createOrchestrationNode('FRAME', 'broken frame')
    const failure = new Error('codegen failed')
    const { notifyMock, cancelMock } = installFigmaPage([node])
    trackSpy(
      spyOn(devupModule, 'buildDevupConfig').mockResolvedValue({ theme: {} }),
    )
    trackSpy(
      spyOn(CodegenModule, 'resetGlobalAssetNodes').mockImplementation(
        () => {},
      ),
    )
    trackSpy(
      spyOn(CodegenModule.Codegen.prototype, 'run').mockRejectedValue(failure),
    )
    trackSpy(spyOn(Date, 'now').mockReturnValue(1000))
    const consoleErrorSpy = trackSpy(
      spyOn(console, 'error').mockImplementation(() => {}),
    )

    await exportPagesAndComponents()

    expect(consoleErrorSpy).toHaveBeenCalledWith(failure)
    expect(cancelMock).toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith(
      'Error exporting pages and components',
      { timeout: 3000, error: true },
    )
  })
})
