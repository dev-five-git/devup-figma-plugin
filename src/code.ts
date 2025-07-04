import { exportDevup, importDevup } from './commands/devup'
import { exportAssets } from './commands/exportAssets'
import { Element } from './Element'

if (figma.editorType === 'dev' && figma.mode === 'codegen') {
  figma.codegen.on('generate', async ({ node }) => {
    return [
      {
        title: node.name,
        language: 'JAVASCRIPT',
        code: await new Element(node).render(),
      },
    ]
  })
}
switch (figma.command) {
  case 'export-devup':
    exportDevup().finally(() => figma.closePlugin())
    break
  case 'import-devup':
    importDevup().finally(() => figma.closePlugin())
    break
  case 'export-assets':
    exportAssets().finally(() => figma.closePlugin())
    break
}
