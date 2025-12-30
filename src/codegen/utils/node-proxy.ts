type AccessedProperty = {
  key: string
  value: unknown
}

type AccessLog = {
  nodeId: string
  nodeName: string
  nodeType: string
  properties: AccessedProperty[]
}

class NodeProxyTracker {
  private accessLogs: Map<string, AccessLog> = new Map()

  clear() {
    this.accessLogs.clear()
  }

  wrap<T extends SceneNode>(node: T): T {
    const nodeId = node.id
    const nodeName = node.name
    const nodeType = node.type

    if (!this.accessLogs.has(nodeId)) {
      this.accessLogs.set(nodeId, {
        nodeId,
        nodeName,
        nodeType,
        properties: [],
      })
    }

    const log = this.accessLogs.get(nodeId)
    if (!log) return node

    const accessedKeys = new Set<string>()

    const handler: ProxyHandler<T> = {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver)
        const key = String(prop)

        // 내부 프로퍼티나 메서드는 제외
        if (
          key.startsWith('_') ||
          typeof value === 'function' ||
          key === 'then' ||
          key === 'toJSON'
        ) {
          return value
        }

        // 중복 기록 방지
        if (!accessedKeys.has(key)) {
          accessedKeys.add(key)

          // 값 직렬화 (circular reference 방지)
          let serializedValue: unknown
          try {
            if (value === null || value === undefined) {
              serializedValue = value
            } else if (typeof value === 'object') {
              const valueObj = value as Record<string, unknown>
              if (Array.isArray(value)) {
                serializedValue = this.serializeArray(value)
              } else if ('id' in valueObj && 'type' in valueObj) {
                // 다른 노드 참조인 경우 - id로 저장
                serializedValue = `[NodeId: ${valueObj.id}]`
              } else {
                serializedValue = this.serializeObject(valueObj)
              }
            } else {
              serializedValue = value
            }
          } catch {
            serializedValue = '[Unserializable]'
          }

          log.properties.push({
            key,
            value: serializedValue,
          })
        }

        // 중첩 객체도 Proxy로 감싸기
        if (value && typeof value === 'object') {
          // children 배열인 경우 각 child를 재귀적으로 추적
          if (key === 'children' && Array.isArray(value)) {
            return value.map((child) => {
              if (
                child &&
                typeof child === 'object' &&
                'id' in child &&
                'type' in child
              ) {
                const wrappedChild = this.wrap(child as unknown as SceneNode)
                // child의 모든 프로퍼티를 강제로 접근해서 추적
                this.trackNodeRecursively(child as unknown as SceneNode)
                return wrappedChild
              }
              return child
            })
          }
          // SceneNode인 경우 재귀적으로 wrap
          if (!Array.isArray(value)) {
            const obj = value as Record<string, unknown>
            if ('id' in obj && 'type' in obj) {
              return this.wrap(value as unknown as SceneNode)
            }
          }
        }

        return value
      },
    }

    return new Proxy(node, handler)
  }

  private trackNodeRecursively(node: SceneNode): void {
    const wrappedNode = this.wrap(node)

    // 주요 프로퍼티들에 접근해서 추적
    const propsToTrack = [
      'id',
      'name',
      'type',
      'visible',
      'parent',
      'children',
      'fills',
      'strokes',
      'effects',
      'opacity',
      'blendMode',
      'width',
      'height',
      'rotation',
      'cornerRadius',
      'topLeftRadius',
      'topRightRadius',
      'bottomLeftRadius',
      'bottomRightRadius',
      'layoutMode',
      'layoutAlign',
      'layoutGrow',
      'layoutSizingHorizontal',
      'layoutSizingVertical',
      'layoutPositioning',
      'primaryAxisAlignItems',
      'counterAxisAlignItems',
      'paddingLeft',
      'paddingRight',
      'paddingTop',
      'paddingBottom',
      'itemSpacing',
      'counterAxisSpacing',
      'clipsContent',
      'isAsset',
      'reactions',
      'minWidth',
      'maxWidth',
      'minHeight',
      'maxHeight',
      'targetAspectRatio',
      'inferredAutoLayout',
      // Stroke 속성
      'strokeWeight',
      'strokeTopWeight',
      'strokeBottomWeight',
      'strokeLeftWeight',
      'strokeRightWeight',
      'strokeAlign',
      'dashPattern',
      // TEXT 노드 속성
      'characters',
      'fontName',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'textAutoResize',
      'textAlignHorizontal',
      'textAlignVertical',
      'textTruncation',
      'maxLines',
      // grid
      'gridColumnAnchorIndex',
      'gridRowAnchorIndex',
      'gridColumnCount',
    ]

    for (const prop of propsToTrack) {
      try {
        void (wrappedNode as unknown as Record<string, unknown>)[prop]
      } catch {
        // ignore
      }
    }

    // TEXT 노드인 경우 getStyledTextSegments 호출해서 결과 저장
    if (node.type === 'TEXT') {
      try {
        const textNode = node as TextNode
        const SEGMENT_TYPE = [
          'fontName',
          'fontWeight',
          'fontSize',
          'textDecoration',
          'textCase',
          'lineHeight',
          'letterSpacing',
          'fills',
          'textStyleId',
          'fillStyleId',
          'listOptions',
          'indentation',
          'hyperlink',
        ] as const
        const segments = textNode.getStyledTextSegments(
          SEGMENT_TYPE as unknown as (keyof Omit<
            StyledTextSegment,
            'characters' | 'start' | 'end'
          >)[],
        )
        // 세그먼트 직렬화
        const serializedSegments = segments.map((seg) => {
          return {
            ...seg,
            fills: this.serializeArray(seg.fills as unknown[]),
          }
        })

        const log = this.accessLogs.get(node.id)
        if (log) {
          log.properties.push({
            key: 'styledTextSegments',
            value: serializedSegments,
          })
        }
      } catch {
        // ignore - getStyledTextSegments가 없는 환경
      }
    }
  }

  private serializeArray(arr: unknown[]): unknown[] {
    return arr.map((item) => {
      if (item === null || item === undefined) return item
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if ('id' in obj && 'type' in obj) {
          return `[NodeId: ${obj.id}]`
        }
        // 숫자 키만 있는 객체는 배열로 변환 (gradientTransform 등)
        if (this.isArrayLikeObject(obj)) {
          return this.arrayLikeToArray(obj)
        }
        return this.serializeObject(obj)
      }
      return item
    })
  }

  private isArrayLikeObject(obj: Record<string, unknown>): boolean {
    const keys = Object.keys(obj)
    if (keys.length === 0) return false
    return keys.every((key) => {
      return /^\d+$/.test(key)
    })
  }

  private arrayLikeToArray(obj: Record<string, unknown>): unknown[] {
    const keys = Object.keys(obj)
      .map(Number)
      .sort((a, b) => {
        return a - b
      })
    return keys.map((key) => {
      return obj[key]
    })
  }

  private serializeObject(
    obj: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'function') continue
      if (value === null || value === undefined) {
        result[key] = value
      } else if (typeof value === 'object') {
        const innerObj = value as Record<string, unknown>
        if ('id' in innerObj && 'type' in innerObj) {
          result[key] = `[NodeId: ${innerObj.id}]`
        } else if (Array.isArray(value)) {
          result[key] = this.serializeArray(value)
        } else {
          result[key] = this.serializeObject(innerObj)
        }
      } else {
        result[key] = value
      }
    }
    return result
  }

  getAccessLog(nodeId: string): AccessLog | undefined {
    return this.accessLogs.get(nodeId)
  }

  getAllAccessLogs(): AccessLog[] {
    return Array.from(this.accessLogs.values())
  }

  toJSON(): Record<string, AccessLog> {
    const result: Record<string, AccessLog> = {}
    for (const [id, log] of this.accessLogs) {
      result[id] = log
    }
    return result
  }

  /**
   * Returns nodes as array with the root node first.
   * @param rootId - The ID of the root node (clicked node) to put first.
   *                 Only includes this node and its descendants.
   */
  toTestCaseFormat(rootId?: string): NodeData[] {
    const allNodes = this.buildAllNodes()
    return this.filterNodes(allNodes, rootId)
  }

  /**
   * Returns nodes and variables info for test cases.
   * Variables are extracted from boundVariables in fills/strokes.
   */
  async toTestCaseFormatWithVariables(rootId?: string): Promise<TestCaseData> {
    const variableMap = new Map<string, VariableInfo>()

    // Variable ID를 수집하는 헬퍼 함수
    const collectVariableIds = (value: unknown): string[] => {
      const ids: string[] = []
      if (
        typeof value === 'string' &&
        value.startsWith('[NodeId: VariableID:')
      ) {
        const match = value.match(/\[NodeId: (VariableID:[^\]]+)\]/)
        if (match) {
          ids.push(match[1])
        }
      } else if (Array.isArray(value)) {
        for (const item of value) {
          ids.push(...collectVariableIds(item))
        }
      } else if (value && typeof value === 'object') {
        for (const v of Object.values(value)) {
          ids.push(...collectVariableIds(v))
        }
      }
      return ids
    }

    // 모든 프로퍼티에서 Variable ID 수집
    for (const log of this.accessLogs.values()) {
      for (const { value } of log.properties) {
        const varIds = collectVariableIds(value)
        for (const varId of varIds) {
          if (!variableMap.has(varId)) {
            try {
              const variable = await figma.variables.getVariableByIdAsync(varId)
              if (variable?.name) {
                variableMap.set(varId, { id: varId, name: variable.name })
              }
            } catch {
              // ignore - Figma API 없는 환경
            }
          }
        }
      }
    }

    const allNodes = this.buildAllNodes()
    const resultNodes = this.filterNodes(allNodes, rootId)

    return {
      nodes: resultNodes,
      variables: Array.from(variableMap.values()),
    }
  }

  private buildAllNodes(): NodeData[] {
    // null이어도 포함되어야 하는 프로퍼티들
    const nullableProps = new Set([
      'maxWidth',
      'maxHeight',
      'minWidth',
      'minHeight',
    ])

    const allNodes: NodeData[] = []
    for (const log of this.accessLogs.values()) {
      const props: Record<string, unknown> = {}
      for (const { key, value } of log.properties) {
        // null 값은 nullableProps에 포함된 경우만 유지
        if (value === null && !nullableProps.has(key)) continue
        props[key] = this.resolveNodeRefs(value)
      }
      allNodes.push({
        id: log.nodeId,
        name: log.nodeName,
        type: log.nodeType,
        ...props,
      })
    }
    return allNodes
  }

  private filterNodes(allNodes: NodeData[], rootId?: string): NodeData[] {
    if (!rootId) {
      return allNodes
    }

    const rootNode = allNodes.find((n) => {
      return n.id === rootId
    })
    if (!rootNode) {
      return allNodes
    }

    // 하위 노드 ID들을 수집 (children을 재귀적으로 탐색)
    const descendantIds = new Set<string>()
    const collectDescendants = (nodeId: string) => {
      const node = allNodes.find((n) => {
        return n.id === nodeId
      })
      if (!node) return
      if (Array.isArray(node.children)) {
        for (const childId of node.children) {
          if (typeof childId === 'string') {
            descendantIds.add(childId)
            collectDescendants(childId)
          }
        }
      }
    }
    collectDescendants(rootId)

    // 루트 노드와 하위 노드들만 필터링
    const result: NodeData[] = [rootNode]
    for (const node of allNodes) {
      if (node.id !== rootId && descendantIds.has(node.id)) {
        result.push(node)
      }
    }

    // 부모 노드도 포함 (SECTION 타입만)
    const parentId =
      typeof rootNode.parent === 'string' ? rootNode.parent : undefined
    if (parentId) {
      const parentNode = allNodes.find((n) => {
        return n.id === parentId
      })
      if (parentNode && parentNode.type === 'SECTION') {
        parentNode.children = [rootId]
        result.push(parentNode)
      }
    }

    return result
  }

  private resolveNodeRefs(value: unknown): unknown {
    if (typeof value === 'string' && value.startsWith('[NodeId: ')) {
      const match = value.match(/\[NodeId: ([^\]]+)\]/)
      if (match) {
        return match[1]
      }
    }
    if (Array.isArray(value)) {
      return value.map((item) => {
        return this.resolveNodeRefs(item)
      })
    }
    return value
  }

  /**
   * Returns a flat list of node objects for test cases.
   * Use assembleNodeTree() to link parent/children relationships.
   */
  toNodeList(): Record<string, unknown>[] {
    const result: Record<string, unknown>[] = []
    for (const log of this.accessLogs.values()) {
      const props: Record<string, unknown> = {}
      for (const { key, value } of log.properties) {
        props[key] = this.resolveNodeRefs(value)
      }
      result.push({
        id: log.nodeId,
        name: log.nodeName,
        type: log.nodeType,
        ...props,
      })
    }
    return result
  }
}

export type NodeData = Record<string, unknown> & {
  id: string
  name: string
  type: string
  parent?: string | NodeData
  children?: (string | NodeData)[]
}

export type VariableInfo = {
  id: string
  name: string
}

export type TestCaseData = {
  nodes: NodeData[]
  variables: VariableInfo[]
}

// 싱글톤 인스턴스
export const nodeProxyTracker = new NodeProxyTracker()

// Re-export from assemble-node-tree for backwards compatibility
export { assembleNodeTree, setupVariableMocks } from './assemble-node-tree'
