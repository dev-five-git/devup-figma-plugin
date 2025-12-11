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
import * as downloadFileModule from '../../utils/download-file'
import { exportComponents } from '../exportComponents'

// mock jszip
mock.module('jszip', () => ({
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

const runMock = mock(() => Promise.resolve())
const getComponentsCodesMock = mock(() => ({}))

mock.module('../codegen/Codegen', () => ({
  Codegen: class {
    node: SceneNode
    constructor(node: SceneNode) {
      this.node = node
    }
    run = runMock
    getComponentsCodes = getComponentsCodesMock
  },
}))

const downloadFileMock = mock(() => Promise.resolve(undefined))

beforeEach(() => {
  spyOn(downloadFileModule, 'downloadFile').mockImplementation(downloadFileMock)
})

afterAll(() => {
  spyOn(downloadFileModule, 'downloadFile').mockRestore()
})

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
    [_: string]: unknown
    characters?: string
    name?: string
    textStyleId?: string
    children?: SceneNode[]
    layoutPositioning?: string
    styledTextSegments?: unknown[]
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
    width: props.width ? parseInt(props.width as string, 10) : undefined,
    height: props.height ? parseInt(props.height as string, 10) : undefined,
    name,
    fills,
    variantProperties,
    children: children ?? [],
  } as unknown as SceneNode
  const retWithChildren = ret as SceneNode & { children: SceneNode[] }
  for (const child of retWithChildren.children) {
    const childWithParent = child as Omit<SceneNode, 'parent'> & {
      parent?: SceneNode
    }
    childWithParent.parent = ret as SceneNode & { parent?: SceneNode }
  }
  return ret
}

const notifyMock = mock(() => {})
const showUIMock = mock(() => {})
const postMessageMock = mock(() => {})

describe('exportComponents', () => {
  beforeEach(() => {
    ;(globalThis as { figma?: unknown }).figma = {
      currentPage: {
        selection: [],
        name: 'TestPage',
      },
      notify: notifyMock,
      showUI: showUIMock,
      ui: { postMessage: postMessageMock, onmessage: null },
    } as unknown as typeof figma
    notifyMock.mockClear()
  })

  afterEach(() => {
    notifyMock.mockClear()
    showUIMock.mockClear()
    postMessageMock.mockClear()
    downloadFileMock.mockClear()
    runMock.mockClear()
    getComponentsCodesMock.mockClear()
  })

  test('should notify and return if no components found', async () => {
    const node = createNode('RECTANGLE', {
      fills: [],
    })
    ;(
      (globalThis as { figma?: { currentPage?: { selection?: SceneNode[] } } })
        .figma?.currentPage as { selection: SceneNode[] }
    ).selection = [node]
    getComponentsCodesMock.mockReturnValueOnce({})
    await exportComponents()
    expect(notifyMock).toHaveBeenCalledWith('No components found')
  })

  test('should not export components if all children are invisible', async () => {
    const node = createNode('GROUP', {
      fills: [],
      children: [
        createNode('VECTOR', {
          fills: [],
          visible: false,
        }),
      ],
    })
    ;(
      (globalThis as { figma?: { currentPage?: { selection?: SceneNode[] } } })
        .figma?.currentPage as { selection: SceneNode[] }
    ).selection = [node]
    getComponentsCodesMock.mockReturnValueOnce({})
    await exportComponents()
    expect(downloadFileMock).not.toHaveBeenCalled()
  })

  test('should export components and call downloadFile', async () => {
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
    ;(
      (globalThis as { figma?: { currentPage?: { selection?: SceneNode[] } } })
        .figma?.currentPage as { selection: SceneNode[] }
    ).selection = [node]
    getComponentsCodesMock.mockReturnValueOnce({
      Component: [['Component.tsx', '<Component />']],
    })
    await exportComponents()
    expect(downloadFileMock).toHaveBeenCalledWith(
      'TestPage.zip',
      expect.any(Uint8Array),
    )
    expect(notifyMock).toHaveBeenCalledWith(
      'Components exported',
      expect.any(Object),
    )
  })

  test('should raise error', async () => {
    const node = createNode('COMPONENT', {
      children: [
        createNode('RECTANGLE', {
          fills: [],
        }),
      ],
    })
    ;(
      (globalThis as { figma?: { currentPage?: { selection?: SceneNode[] } } })
        .figma?.currentPage as { selection: SceneNode[] }
    ).selection = [node]
    getComponentsCodesMock.mockImplementation(() => {
      throw new Error('boom')
    })
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {})
    await exportComponents()
    expect(notifyMock).toHaveBeenCalledWith('Error exporting components', {
      timeout: 3000,
      error: true,
    })
    consoleErrorSpy.mockRestore()
  })
})
