// Make sure that we're in Dev Mode and running codegen
import { render } from './render'
import { createCode } from './utils'

if (figma.editorType === 'dev' && figma.mode === 'codegen') {
  // Register a callback to the "generate" event
  figma.codegen.on('generate', async ({ node }) => {
    return [
      {
        title: node.name,
        language: 'JAVASCRIPT',
        code: render(await createCode(node)),
      },
    ]
  })
}
