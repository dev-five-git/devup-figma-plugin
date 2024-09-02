export async function addLabel(label: string, node: SceneNode) {
  const text = figma.createText()
  await figma.loadFontAsync(text.fontName as any)
  text.fontSize = 12
  text.characters = label
  const frame = figma.createFrame()
  // flex mode
  frame.layoutMode = 'HORIZONTAL'

  // auto layout top right
  // frame.primaryAxisAlignItems = 'CENTER'
  frame.counterAxisAlignItems = 'CENTER'
  // auto layout direction
  frame.primaryAxisSizingMode = 'AUTO'
  frame.counterAxisSizingMode = 'AUTO'

  frame.itemSpacing = 4
  frame.name = label
  frame.appendChild(node)
  frame.appendChild(text)
  return frame
}
