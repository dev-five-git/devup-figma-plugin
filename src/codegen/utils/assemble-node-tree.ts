import type { NodeData, VariableInfo } from './node-proxy'

/**
 * Sets up figma.variables.getVariableByIdAsync mock for test environment.
 */
export function setupVariableMocks(variables: VariableInfo[]): void {
  if (typeof globalThis === 'undefined') return

  const g = globalThis as { figma?: { variables?: Record<string, unknown> } }
  if (!g.figma) return

  const variableMap = new Map(
    variables.map((v) => {
      return [v.id, v]
    }),
  )

  // 기존 mock을 보존하면서 새로운 변수들 추가
  const originalGetVariable = g.figma.variables?.getVariableByIdAsync as
    | ((id: string) => Promise<unknown>)
    | undefined

  g.figma.variables = {
    ...g.figma.variables,
    getVariableByIdAsync: async (id: string) => {
      const varInfo = variableMap.get(id)
      if (varInfo) {
        return { id: varInfo.id, name: varInfo.name }
      }
      // 기존 mock이 있으면 폴백
      if (originalGetVariable) {
        return originalGetVariable(id)
      }
      return null
    },
  }
}

/**
 * Assembles a node tree from a flat list of nodes.
 * Links parent/children by id references.
 * Optionally sets up variable mocks from the variables array.
 */
export function assembleNodeTree(
  nodes: NodeData[],
  variables?: VariableInfo[],
): NodeData {
  // Variable mock 설정
  if (variables && variables.length > 0) {
    setupVariableMocks(variables)
  }
  const nodeMap = new Map<string, NodeData>()

  // 1. 모든 노드를 복사해서 맵에 저장
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node })
  }

  // 2. parent/children 관계 연결 및 TEXT 노드 mock 메서드 추가
  for (const node of nodeMap.values()) {
    // parent 연결
    if (typeof node.parent === 'string') {
      const parentNode = nodeMap.get(node.parent)
      node.parent = parentNode
    }

    // children 연결 (없는 노드는 필터링)
    if (Array.isArray(node.children)) {
      node.children = node.children
        .map((childId) => {
          if (typeof childId === 'string') {
            return nodeMap.get(childId)
          }
          return childId
        })
        .filter((child): child is NodeData => {
          return child !== undefined
        })
    }
    // children이 undefined인 경우 그대로 유지 (RECTANGLE 등 원래 children이 없는 노드)

    // defaultVariant 연결 (COMPONENT_SET용)
    if (typeof node.defaultVariant === 'string') {
      const defaultVariantNode = nodeMap.get(node.defaultVariant)
      if (defaultVariantNode) {
        node.defaultVariant = defaultVariantNode
      }
    }

    // fills/strokes의 boundVariables 처리
    // boundVariables.color가 문자열 ID인 경우 { id: '...' } 객체로 변환
    const processBoundVariables = (paints: unknown[]) => {
      for (const paint of paints) {
        if (paint && typeof paint === 'object') {
          const p = paint as Record<string, unknown>
          if (p.boundVariables && typeof p.boundVariables === 'object') {
            const bv = p.boundVariables as Record<string, unknown>
            if (typeof bv.color === 'string') {
              // '[NodeId: VariableID:...]' 형식에서 실제 ID 추출
              let colorId = bv.color
              const match = colorId.match(/\[NodeId: ([^\]]+)\]/)
              if (match) {
                colorId = match[1]
              }
              bv.color = { id: colorId }
            }
          }

          // Gradient stops의 boundVariables 처리
          if (Array.isArray(p.gradientStops)) {
            for (const stop of p.gradientStops) {
              if (stop && typeof stop === 'object') {
                const s = stop as Record<string, unknown>
                if (s.boundVariables && typeof s.boundVariables === 'object') {
                  const bv = s.boundVariables as Record<string, unknown>
                  if (typeof bv.color === 'string') {
                    let colorId = bv.color
                    const match = colorId.match(/\[NodeId: ([^\]]+)\]/)
                    if (match) {
                      colorId = match[1]
                    }
                    bv.color = { id: colorId }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (Array.isArray(node.fills)) {
      processBoundVariables(node.fills)
    }
    if (Array.isArray(node.strokes)) {
      processBoundVariables(node.strokes)
    }

    // strokeWeight가 없고 개별 stroke weights가 있으면 strokeWeight를 figma.mixed로 설정
    if (
      node.strokeWeight === undefined &&
      (node.strokeTopWeight !== undefined ||
        node.strokeBottomWeight !== undefined ||
        node.strokeLeftWeight !== undefined ||
        node.strokeRightWeight !== undefined)
    ) {
      const figmaGlobal = globalThis as unknown as {
        figma?: { mixed?: unknown }
      }
      if (figmaGlobal.figma?.mixed) {
        ;(node as unknown as Record<string, unknown>).strokeWeight =
          figmaGlobal.figma.mixed
      }
    }

    // INSTANCE 노드에 getMainComponentAsync mock 메서드 추가
    if (node.type === 'INSTANCE') {
      ;(node as unknown as Record<string, unknown>).getMainComponentAsync =
        async () => {
          // INSTANCE 노드는 mainComponent 속성을 참조하거나 null 반환
          return null
        }
    }

    // 모든 노드에 getMainComponentAsync 메서드 추가 (아직 없는 경우에만)
    if (!(node as unknown as Record<string, unknown>).getMainComponentAsync) {
      ;(node as unknown as Record<string, unknown>).getMainComponentAsync =
        async () => {
          return null
        }
    }

    // TEXT 노드에 getStyledTextSegments mock 메서드 추가
    if (node.type === 'TEXT') {
      const textNode = node as NodeData & { styledTextSegments?: unknown[] }

      // styledTextSegments 내의 fills도 boundVariables 처리
      if (textNode.styledTextSegments) {
        for (const seg of textNode.styledTextSegments) {
          if (seg && typeof seg === 'object') {
            const s = seg as Record<string, unknown>
            if (Array.isArray(s.fills)) {
              processBoundVariables(s.fills)
            }
          }
        }
      }

      ;(node as unknown as Record<string, unknown>).getStyledTextSegments =
        () => {
          // 테스트 데이터에 styledTextSegments가 있으면 사용
          if (textNode.styledTextSegments) {
            return textNode.styledTextSegments
          }
          // 없으면 기본 세그먼트 생성
          return [
            {
              characters: (node.characters as string) || '',
              start: 0,
              end: ((node.characters as string) || '').length,
              fontName: (node.fontName as { family: string }) || {
                family: 'Inter',
                style: 'Regular',
              },
              fontWeight: (node.fontWeight as number) || 400,
              fontSize: (node.fontSize as number) || 12,
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              lineHeight: (node.lineHeight as unknown) || { unit: 'AUTO' },
              letterSpacing: (node.letterSpacing as unknown) || {
                unit: 'PERCENT',
                value: 0,
              },
              fills: (node.fills as unknown[]) || [],
              textStyleId: '',
              fillStyleId: '',
              listOptions: { type: 'NONE' },
              indentation: 0,
              hyperlink: null,
            },
          ]
        }
    }
  }

  // 3. parent가 없는 노드(루트) 찾아서 반환
  for (const node of nodeMap.values()) {
    if (!node.parent) {
      return node
    }
  }
  // fallback: 첫 번째 노드 반환
  return nodeMap.get(nodes[0].id) || nodes[0]
}
