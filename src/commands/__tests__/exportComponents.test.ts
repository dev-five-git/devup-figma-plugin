import { downloadFile } from '../../utils/download-file'
import { exportComponents } from '../exportComponents'
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
    visible = true,
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
    visible,
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

describe('exportComponents', () => {
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

  it('should notify and return if no components found', async () => {
    const node = createNode('RECTANGLE', {
      fills: [],
    })
    ;(globalThis as any).figma.currentPage.selection = [node]
    await exportComponents()
    expect(notifyMock).toHaveBeenCalledWith('No components found')
  })

  it('should not export components if all children are invisible', async () => {
    const node = createNode('GROUP', {
      fills: [],
      children: [
        createNode('VECTOR', {
          fills: [],
          visible: false,
        }),
      ],
    })
    ;(globalThis as any).figma.currentPage.selection = [node]
    await exportComponents()
    expect(downloadFile).not.toHaveBeenCalled()
  })

  it('should export components and call downloadFile', async () => {
    const node = createNode('COMPONENT', {
      fills: [],
      name: 'Component',
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
          background: 'red',
          width: '100px',
          height: '100px',
          name: 'image.png',
        }),
      ],
    })
    ;(globalThis as any).figma.currentPage.selection = [node]
    await exportComponents()
    expect(downloadFile).toHaveBeenCalledWith(
      'TestPage.zip',
      expect.any(Uint8Array),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      'Components exported',
      expect.any(Object),
    )
  })

  it('should raise error', async () => {
    const node = createNode('COMPONENT', {
      children: [
        createNode('RECTANGLE', {
          fills: [],
        }),
      ],
    })
    ;(globalThis as any).figma.currentPage.selection = [node]
    await exportComponents()
    expect(notifyMock).toHaveBeenCalledWith('Error exporting components', {
      timeout: 3000,
      error: true,
    })
  })
})
