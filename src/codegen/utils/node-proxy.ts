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
                // 다른 노드 참조인 경우
                serializedValue = `[Node: ${valueObj.type}]`
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

        // 중첩 객체도 Proxy로 감싸기 (fills, strokes 등)
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const obj = value as Record<string, unknown>
          if ('id' in obj && 'type' in obj) {
            // SceneNode인 경우 재귀적으로 wrap
            return this.wrap(value as unknown as SceneNode)
          }
        }

        return value
      },
    }

    return new Proxy(node, handler)
  }

  private serializeArray(arr: unknown[]): unknown[] {
    return arr.map((item) => {
      if (item === null || item === undefined) return item
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>
        if ('id' in obj && 'type' in obj) {
          return `[Node: ${obj.type}]`
        }
        return this.serializeObject(obj)
      }
      return item
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
          result[key] = `[Node: ${innerObj.type}]`
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

  toTestCaseFormat(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {}
    for (const [id, log] of this.accessLogs) {
      const props: Record<string, unknown> = {}
      for (const { key, value } of log.properties) {
        props[key] = value
      }
      result[id] = {
        id: log.nodeId,
        name: log.nodeName,
        type: log.nodeType,
        ...props,
      }
    }
    return result
  }
}

// 싱글톤 인스턴스
export const nodeProxyTracker = new NodeProxyTracker()
