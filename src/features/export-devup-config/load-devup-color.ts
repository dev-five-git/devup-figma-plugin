export async function loadDevupColor(): Promise<{
  light: Record<string, string>
  dark: Record<string, string>
} | null> {
  await figma.loadAllPagesAsync()
  const page: PageNode | undefined = figma.root.findAll(
    (node) => node.type === 'PAGE' && node.name === 'Devup Design System',
  )[0] as PageNode | undefined
  if (!page) return null

  const palette = page.findChild(
    (node) => node.type === 'FRAME' && node.name === 'Devup Color Palette',
  ) as FrameNode | undefined
  if (!palette) return null

  const obj: { light: Record<string, string>; dark: Record<string, string> } = {
    dark: {},
    light: {},
  }
  for (const value of palette.children) {
    const keys = value.getPluginDataKeys()
    if (!keys.includes('DEVUP_COLORS_KEY')) {
      continue
    }

    const _key = await value.getPluginData('DEVUP_COLORS_KEY')
    if (keys.includes('DEVUP_DARK_COLORS_VALUE'))
      obj.light[_key] = await value.getPluginData('DEVUP_COLORS_VALUE')

    if (keys.includes('DEVUP_DARK_COLORS_VALUE'))
      obj.dark[_key] = await value.getPluginData('DEVUP_DARK_COLORS_VALUE')
  }
  return obj
}
