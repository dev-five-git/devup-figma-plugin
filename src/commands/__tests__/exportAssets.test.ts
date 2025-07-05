import { downloadFile } from '../../utils/download-file'
import { exportAssets } from '../exportAssets'
vi.mock('download-file', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('jszip', () => ({
  default: class JSZipMock {
    files: Record<string, unknown> = {}
    file(name: string, data: unknown) {
      this.files[name] = data
    }
    async generateAsync() {
      return new Uint8Array([1, 2, 3])
    }
  },
}))

vi.mock('../../utils/download-file', () => ({
  downloadFile: vi.fn().mockResolvedValue(undefined),
}))

function createNode(
  type: SceneNode['type'],
  {
    characters,
    children,
    textStyleId,
    name,
    fills,
    parent,
    layoutPositioning = 'AUTO',
    layoutSizingHorizontal,
    styledTextSegments = [],
    variantProperties,
    ...props
  }: {
    [_: string]: any
    characters?: string
    name?: string
    textStyleId?: string
    children?: SceneNode[]
    layoutPositioning?: string
    styledTextSegments?: any[]
    variantProperties?: Record<string, string>
  } = {},
): SceneNode {
  const ret = {
    type,
    getCSSAsync: async () => props,
    exportAsync: async () => '<svg>\n<path/>\n</svg>',
    getStyledTextSegments: () => styledTextSegments,
    layoutSizingHorizontal,
    textStyleId,
    parent,
    characters,
    visible: true,
    layoutPositioning,
    width: props.width ? parseInt(props.width) : undefined,
    height: props.height ? parseInt(props.height) : undefined,
    name,
    fills,
    variantProperties,
    children: children ?? [],
  } as unknown as SceneNode
  ;(ret as any).children.forEach((child: any) => {
    ;(child as any).parent = ret
  })
  return ret
}

const notifyMock = vi.fn()
const showUIMock = vi.fn()
const postMessageMock = vi.fn()

describe('exportAssets', () => {
  beforeEach(() => {
    ;(globalThis as any).figma = {
      currentPage: {
        selection: [],
        name: 'TestPage',
      },
      notify: notifyMock,
      showUI: showUIMock,
      ui: { postMessage: postMessageMock, onmessage: null },
    }
    notifyMock.mockClear()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('should notify and return if no assets found', async () => {
    const node = createNode('RECTANGLE', {
      fills: [],
    })
    ;(globalThis as any).figma.currentPage.selection = [node]
    await exportAssets()
    expect(notifyMock).toHaveBeenCalledWith(
      'No assets found',
      expect.any(Object),
    )
  })

  it('should export assets and call downloadFile', async () => {
    const node = createNode('RECTANGLE', {
      fills: [],
      children: [
        createNode('VECTOR', {
          fills: [],
          width: '100px',
          height: '100px',
        }),
        createNode('RECTANGLE', {
          fills: [
            {
              type: 'IMAGE',
              imageRef: {
                id: '123',
              },
              scaleMode: 'FILL',
            },
          ],
          width: '100px',
          height: '100px',
          name: 'image.png',
        }),
      ],
    })
    ;(globalThis as any).figma.currentPage.selection = [node]
    await exportAssets()
    expect(downloadFile).toHaveBeenCalledWith(
      'TestPage.zip',
      expect.any(Uint8Array),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      'Assets exported',
      expect.any(Object),
    )
  })
})
