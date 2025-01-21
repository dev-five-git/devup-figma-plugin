import { exportDevup } from './devup'
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
if (figma.editorType === 'figma')
  switch (figma.command) {
    case 'export-devup':
      exportDevup().finally(() => figma.closePlugin())
      break
  }
