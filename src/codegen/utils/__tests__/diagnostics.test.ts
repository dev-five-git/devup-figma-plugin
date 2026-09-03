import { describe, expect, it } from 'bun:test'
import {
  describeNode,
  errorMessage,
  formatCodegenErrorReport,
  getErrorTrace,
  inspectNode,
  tagError,
  traceAsync,
  traceSync,
} from '../diagnostics'

function throwingProp(key: string, rest: Record<string, unknown> = {}) {
  const node: Record<string, unknown> = { ...rest }
  Object.defineProperty(node, key, {
    enumerable: true,
    get() {
      throw new Error(`cannot read ${key}`)
    },
  })
  return node
}

describe('errorMessage', () => {
  it('formats Error instances', () => {
    expect(errorMessage(new TypeError('boom'))).toBe('TypeError: boom')
  })

  it('formats non-error throws', () => {
    expect(errorMessage('boom')).toBe('Thrown non-error value: boom')
  })
})

describe('describeNode', () => {
  it('describes a SceneNode', () => {
    expect(describeNode({ type: 'TEXT', name: 'Title', id: '1:2' })).toBe(
      'TEXT "Title" (1:2)',
    )
  })

  it('falls back to NodeTree fields', () => {
    expect(describeNode({ nodeType: 'FRAME', nodeName: 'Row' })).toBe(
      'FRAME "Row" (<no id>)',
    )
  })

  it('falls back to placeholders when fields are missing or unreadable', () => {
    expect(describeNode({})).toBe('UNKNOWN "<unnamed>" (<no id>)')
    expect(describeNode({ type: 1, name: 2, id: 3 })).toBe(
      'UNKNOWN "<unnamed>" (<no id>)',
    )
    expect(describeNode(throwingProp('type'))).toBe(
      'UNKNOWN "<unnamed>" (<no id>)',
    )
  })

  it('handles non-object values', () => {
    expect(describeNode(null)).toBe('<null>')
    expect(describeNode(undefined)).toBe('<undefined>')
    expect(describeNode('nope')).toBe('<nope>')
  })
})

describe('inspectNode', () => {
  it('reports non-object values', () => {
    expect(inspectNode(undefined)).toBe('  <no node: undefined>')
    expect(inspectNode(null)).toBe('  <no node: null>')
  })

  it('dumps scalar and list fields', () => {
    const report = inspectNode({
      id: '1:2',
      name: 'Row',
      type: 'FRAME',
      visible: true,
      width: 100,
      fills: [{ type: 'SOLID' }, { color: 1 }, 'x'],
      children: [],
      reactions: 'MIXED',
    })
    expect(report).toContain('id: "1:2"')
    expect(report).toContain('type: "FRAME"')
    expect(report).toContain('visible: true')
    expect(report).toContain('width: 100')
    expect(report).toContain('height: <absent>')
    expect(report).toContain('fills: len=3 [SOLID, object, string]')
    expect(report).toContain('children: len=0 []')
    expect(report).toContain('reactions: "MIXED"')
  })

  it('truncates long strings and reports unserializable values', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const report = inspectNode({
      name: 'a'.repeat(200),
      component: circular,
    })
    expect(report).toContain('...')
    expect(report).toContain('component: <unserializable>')
  })

  it('reports fields whose getter throws', () => {
    expect(inspectNode(throwingProp('width'))).toContain(
      'width: <throws Error: cannot read width>',
    )
  })

  it('dumps styled text segments for TEXT nodes', () => {
    const report = inspectNode({
      type: 'TEXT',
      characters: 'hi',
      getStyledTextSegments: () => [
        {
          listOptions: { type: 'NONE' },
          fills: [{ type: 'SOLID' }],
          textStyleId: '',
          fontName: { family: 'Inter' },
          characters: 'hi',
        },
        { characters: 'bye' },
      ],
    })
    expect(report).toContain('styledTextSegments: len=2')
    expect(report).toContain('[0] listOptions={"type":"NONE"}')
    expect(report).toContain('[1] listOptions=undefined')
  })

  it('reports when styled text segments are unavailable or throw', () => {
    expect(inspectNode({ type: 'TEXT' })).toContain(
      'styledTextSegments: <not available>',
    )
    expect(
      inspectNode({
        type: 'TEXT',
        getStyledTextSegments: () => {
          throw new Error('nope')
        },
      }),
    ).toContain('styledTextSegments: <throws Error: nope>')
    expect(inspectNode(throwingProp('type'))).toContain(
      'styledTextSegments: <throws Error: cannot read type>',
    )
  })
})

describe('tagError / getErrorTrace', () => {
  it('attaches frames to an error and appends on re-tag', () => {
    const error = new Error('boom')
    tagError(error, 'renderText', { type: 'TEXT', name: 'A', id: '1' })
    tagError(error, 'buildTree', { type: 'FRAME', name: 'B', id: '2' })
    const trace = getErrorTrace(error)
    expect(trace).toHaveLength(2)
    expect(trace[0].label).toBe('renderText')
    expect(trace[1].label).toBe('buildTree')
  })

  it('caps the number of frames', () => {
    const error = new Error('boom')
    for (let i = 0; i < 60; i++) tagError(error, `frame-${i}`, null)
    expect(getErrorTrace(error)).toHaveLength(50)
  })

  it('wraps non-object throws so they can carry a trace', () => {
    const tagged = tagError('boom', 'buildTree', null)
    expect(tagged).toBeInstanceOf(Error)
    expect((tagged as Error).message).toBe('Thrown non-error value: boom')
    expect(getErrorTrace(tagged)).toHaveLength(1)
  })

  it('skips non-extensible errors', () => {
    const error = Object.preventExtensions(new Error('frozen'))
    expect(tagError(error, 'buildTree', null)).toBe(error)
    expect(getErrorTrace(error)).toHaveLength(0)
  })

  it('returns an empty trace for untagged values', () => {
    expect(getErrorTrace(null)).toHaveLength(0)
    expect(getErrorTrace('boom')).toHaveLength(0)
    expect(getErrorTrace(new Error('boom'))).toHaveLength(0)
    expect(getErrorTrace({ __devupTrace: 'nope' })).toHaveLength(0)
  })
})

describe('traceSync / traceAsync', () => {
  it('passes values through untouched', async () => {
    expect(traceSync('renderTree', null, () => 'ok')).toBe('ok')
    await expect(traceAsync('buildTree', null, async () => 'ok')).resolves.toBe(
      'ok',
    )
  })

  it('tags synchronous failures', () => {
    const node = { type: 'FRAME', name: 'Row', id: '1:2' }
    expect(() =>
      traceSync('renderTree', node, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    try {
      traceSync('renderTree', node, () => {
        throw new Error('boom')
      })
    } catch (error) {
      expect(getErrorTrace(error)[0]).toEqual({ label: 'renderTree', node })
    }
  })

  it('tags asynchronous failures', async () => {
    const node = { type: 'TEXT', name: 'Title', id: '1:3' }
    try {
      await traceAsync('renderText', node, async () => {
        throw new Error('boom')
      })
      throw new Error('should not reach')
    } catch (error) {
      expect(getErrorTrace(error)[0]).toEqual({ label: 'renderText', node })
    }
  })
})

describe('formatCodegenErrorReport', () => {
  it('renders the traced path and the failing node', async () => {
    const textNode = {
      type: 'TEXT',
      name: 'Title',
      id: '1:3',
      getStyledTextSegments: () => [{ characters: 'hi' }],
    }
    const frameNode = { type: 'FRAME', name: 'Row', id: '1:2' }
    let caught: unknown
    try {
      await traceAsync('buildTree', frameNode, () =>
        traceAsync('renderText', textNode, async () => {
          throw new TypeError("cannot read property 'type' of undefined")
        }),
      )
    } catch (error) {
      caught = error
    }

    const report = formatCodegenErrorReport(caught, {
      node: frameNode,
      language: 'devup-ui',
    })
    expect(report).toContain('DEVUP UI CODEGEN ERROR')
    expect(report).toContain(
      "error    : TypeError: cannot read property 'type' of undefined",
    )
    expect(report).toContain('language : devup-ui')
    expect(report).toContain('selected : FRAME "Row" (1:2)')
    expect(report).toContain('failing  : TEXT "Title" (1:3)')
    expect(report).toContain('1. renderText :: TEXT "Title" (1:3)')
    expect(report).toContain('2. buildTree :: FRAME "Row" (1:2)')
    expect(report).toContain('styledTextSegments: len=1')
    expect(report).toContain('--- raw stack (minified) ---')
  })

  it('falls back when there is no trace and no stack', () => {
    const report = formatCodegenErrorReport('boom')
    expect(report).toContain('error    : Thrown non-error value: boom')
    expect(report).toContain('language : <unknown>')
    expect(report).toContain('<no traced frames>')
    expect(report).toContain('  <no node: undefined>')
    expect(report).toContain('  <no stack>')
  })
})
