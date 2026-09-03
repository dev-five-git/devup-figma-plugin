/**
 * Codegen diagnostics.
 *
 * The plugin ships as one minified bundle, so the stack traces Figma prints
 * (`at <anonymous> (PLUGIN_37_SOURCE:1:243768)`) carry no usable information.
 * Instead of relying on them, every significant codegen step tags the error it
 * observes with the Figma node it was processing. `formatCodegenErrorReport`
 * turns that chain into a copy-pasteable report naming the exact node, the
 * phase, and the node's raw shape.
 *
 * Tagging is zero-cost on the success path — nothing is formatted or allocated
 * for the report until an error actually escapes.
 */

export interface TraceFrame {
  label: string
  node: unknown
}

interface TracedError {
  __devupTrace?: TraceFrame[]
}

const TRACE_KEY = '__devupTrace'

/** Caps the trace so a deep tree cannot produce an unbounded report. */
const MAX_TRACE_FRAMES = 50

const SEPARATOR = '='.repeat(72)

/** Scalar-ish fields dumped verbatim for the failing node. */
const BASIC_KEYS = [
  'id',
  'name',
  'type',
  'nodeType',
  'nodeName',
  'component',
  'visible',
  'width',
  'height',
  'opacity',
  'rotation',
  'characters',
] as const

/** Array fields dumped as `len=N [itemType, ...]`. */
const LIST_KEYS = [
  'children',
  'fills',
  'strokes',
  'effects',
  'reactions',
] as const

const TEXT_SEGMENT_FIELDS = [
  'listOptions',
  'fills',
  'textStyleId',
  'fontName',
  'fontSize',
] as const

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return `Thrown non-error value: ${String(error)}`
}

function formatValue(value: unknown): string {
  if (typeof value === 'string')
    return JSON.stringify(
      value.length > 80 ? `${value.slice(0, 80)}...` : value,
    )
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value)
    } catch {
      return '<unserializable>'
    }
  }
  return String(value)
}

function summarizeList(value: unknown): string {
  if (!Array.isArray(value)) return formatValue(value)
  const kinds = value.map((item) => {
    if (item !== null && typeof item === 'object') {
      const type = (item as { type?: unknown }).type
      if (typeof type === 'string') return type
    }
    return typeof item
  })
  return `len=${value.length} [${kinds.join(', ')}]`
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | null {
  try {
    const value = record[key]
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

function readForReport(
  record: Record<string, unknown>,
  key: string,
  format: (value: unknown) => string,
): string {
  try {
    const value = record[key]
    return value === undefined ? '<absent>' : format(value)
  } catch (error) {
    return `<throws ${errorMessage(error)}>`
  }
}

/**
 * TEXT nodes are the richest failure source (styled segments carry optional
 * fields such as `listOptions`), so dump every segment when one is involved.
 */
function inspectTextSegments(record: Record<string, unknown>): string[] {
  try {
    if (record.type !== 'TEXT') return []
    const getSegments = record.getStyledTextSegments
    if (typeof getSegments !== 'function')
      return ['  styledTextSegments: <not available>']
    const segments = (
      getSegments as (fields: readonly string[]) => unknown[]
    ).call(record, TEXT_SEGMENT_FIELDS)
    const lines = [`  styledTextSegments: len=${segments.length}`]
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i] as Record<string, unknown>
      lines.push(
        `    [${i}] listOptions=${formatValue(seg.listOptions)}` +
          ` fills=${summarizeList(seg.fills)}` +
          ` textStyleId=${formatValue(seg.textStyleId)}` +
          ` fontName=${formatValue(seg.fontName)}` +
          ` characters=${formatValue(seg.characters)}`,
      )
    }
    return lines
  } catch (error) {
    return [`  styledTextSegments: <throws ${errorMessage(error)}>`]
  }
}

/** One-line identity of a Figma SceneNode or an intermediate NodeTree. */
export function describeNode(node: unknown): string {
  if (node === null || typeof node !== 'object') return `<${String(node)}>`
  const record = node as Record<string, unknown>
  const type =
    readString(record, 'type') ?? readString(record, 'nodeType') ?? 'UNKNOWN'
  const name =
    readString(record, 'name') ?? readString(record, 'nodeName') ?? '<unnamed>'
  const id = readString(record, 'id') ?? '<no id>'
  return `${type} "${name}" (${id})`
}

/** Multi-line dump of everything we can safely read off the failing node. */
export function inspectNode(node: unknown): string {
  if (node === null || typeof node !== 'object')
    return `  <no node: ${String(node)}>`
  const record = node as Record<string, unknown>
  const lines: string[] = []
  for (const key of BASIC_KEYS)
    lines.push(`  ${key}: ${readForReport(record, key, formatValue)}`)
  for (const key of LIST_KEYS)
    lines.push(`  ${key}: ${readForReport(record, key, summarizeList)}`)
  for (const line of inspectTextSegments(record)) lines.push(line)
  return lines.join('\n')
}

/**
 * Attach `label` + `node` to an error so the caller chain becomes readable.
 * Non-object throws are wrapped so they can carry a trace too.
 */
export function tagError(
  error: unknown,
  label: string,
  node: unknown,
): unknown {
  const carrier =
    error !== null && typeof error === 'object'
      ? error
      : new Error(errorMessage(error))
  const traced = carrier as TracedError
  const frames = traced[TRACE_KEY]
  if (frames) {
    if (frames.length < MAX_TRACE_FRAMES) frames.push({ label, node })
  } else if (Object.isExtensible(carrier)) {
    traced[TRACE_KEY] = [{ label, node }]
  }
  return carrier
}

export function getErrorTrace(error: unknown): readonly TraceFrame[] {
  if (error === null || typeof error !== 'object') return []
  const frames = (error as TracedError)[TRACE_KEY]
  return Array.isArray(frames) ? frames : []
}

export function traceSync<T>(label: string, node: unknown, run: () => T): T {
  try {
    return run()
  } catch (error) {
    throw tagError(error, label, node)
  }
}

export async function traceAsync<T>(
  label: string,
  node: unknown,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw tagError(error, label, node)
  }
}

function formatStack(error: unknown): string {
  if (error instanceof Error && typeof error.stack === 'string')
    return error.stack
  return '  <no stack>'
}

export function formatCodegenErrorReport(
  error: unknown,
  context: { node?: unknown; language?: string } = {},
): string {
  const frames = getErrorTrace(error)
  const failingNode = frames.length > 0 ? frames[0].node : context.node
  const lines: string[] = [
    SEPARATOR,
    'DEVUP UI CODEGEN ERROR - copy this whole block and send it to the maintainer',
    SEPARATOR,
    `error    : ${errorMessage(error)}`,
    `language : ${context.language ?? '<unknown>'}`,
    `selected : ${describeNode(context.node)}`,
    `failing  : ${describeNode(failingNode)}`,
    '',
    '--- codegen path (innermost first) ---',
  ]
  if (frames.length === 0) {
    lines.push('  <no traced frames>')
  } else {
    for (let i = 0; i < frames.length; i++)
      lines.push(
        `  ${i + 1}. ${frames[i].label} :: ${describeNode(frames[i].node)}`,
      )
  }
  lines.push('', '--- failing node ---', inspectNode(failingNode))
  lines.push('', '--- raw stack (minified) ---', formatStack(error))
  lines.push(SEPARATOR)
  return lines.join('\n')
}
