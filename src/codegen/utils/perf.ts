const perfEntries: Map<string, { total: number; count: number }> = new Map()

export function perfStart(): number {
  return Date.now()
}

export function perfEnd(label: string, start: number): void {
  const elapsed = Date.now() - start
  const entry = perfEntries.get(label)
  if (entry) {
    entry.total += elapsed
    entry.count++
  } else {
    perfEntries.set(label, { total: elapsed, count: 1 })
  }
}

export function perfReset(): void {
  perfEntries.clear()
}

export function perfReport(): string {
  const lines: string[] = ['[perf] --- Performance Report ---']
  const sorted = [...perfEntries.entries()].sort(
    ([, a], [, b]) => b.total - a.total,
  )
  for (const [label, { total, count }] of sorted) {
    const avg = count > 0 ? (total / count).toFixed(1) : '0'
    lines.push(
      `[perf] ${label}: ${total}ms total, ${count} calls, ${avg}ms avg`,
    )
  }
  lines.push('[perf] --- End Report ---')
  return lines.join('\n')
}
