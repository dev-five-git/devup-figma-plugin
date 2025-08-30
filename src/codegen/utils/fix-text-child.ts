export function fixTextChild(children: string) {
  return children
    .replace(/([{}&<>]+)/g, '{"$1"}')
    .replace(/(^\s+)|(\s+$)/g, (match) => `{"${' '.repeat(match.length)}"}`)
}
