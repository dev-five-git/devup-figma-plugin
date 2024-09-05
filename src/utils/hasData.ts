export function hasData(node: BaseNodeMixin, key: string): boolean {
  const keys = node.getPluginDataKeys()
  return keys.includes(key)
}
