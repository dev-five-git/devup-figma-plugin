export async function getEffectProps(
  node: SceneNode,
): Promise<Record<string, string> | undefined> {
  if ('effects' in node && node.effects.length > 0) {
    const css = await node.getCSSAsync()
    return {
      boxShadow: css['box-shadow'],
      filter: css.filter,
      backdropFilter: css['backdrop-filter'],
      WebkitBackdropFilter: css['backdrop-filter'],
    }
  }
}
