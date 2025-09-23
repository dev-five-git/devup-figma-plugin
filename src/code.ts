import { Codegen } from './codegen/Codegen'
import { wrapComponent } from './codegen/utils/wrap-component'
import { exportDevup, importDevup } from './commands/devup'
import { exportAssets } from './commands/exportAssets'
import { exportComponents } from './commands/exportComponents'
import { Element } from './Element'
import { getComponentName } from './utils'

if (figma.editorType === 'dev' && figma.mode === 'codegen') {
  figma.codegen.on('generate', async ({ node, language }) => {
    switch (language) {
      case 'devup-ui-old': {
        const time = Date.now()
        const code = await new Element(node).render()
        console.info(`[benchmark] devup-ui-old end ${Date.now() - time}ms`)
        return [
          {
            title: node.name,
            language: 'JAVASCRIPT',
            code,
          },
        ] as const
      }
      case 'devup-ui': {
        const time = Date.now()
        const codegen = new Codegen(node)
        await codegen.run()
        const componentsCodes = codegen.getComponentsCodes()
        console.info(`[benchmark] devup-ui end ${Date.now() - time}ms`)
        return [
          {
            title: node.name,
            language: 'TYPESCRIPT',
            code:
              node.type === 'COMPONENT' ||
              node.type === 'COMPONENT_SET' ||
              node.type === 'INSTANCE'
                ? wrapComponent(getComponentName(node), codegen.getCode())
                : codegen.getCode(),
          },
          ...(componentsCodes.length > 0
            ? ([
                {
                  title: node.name + ' - Components',
                  language: 'TYPESCRIPT',
                  code: componentsCodes.map((code) => code[1]).join('\n\n'),
                },
                {
                  title: node.name + ' - Components CLI',
                  language: 'BASH',
                  code: componentsCodes
                    .map(
                      ([componentName, code]) =>
                        `echo '${code}' > ${componentName}.tsx`,
                    )
                    .join('\n'),
                },
              ] as const)
            : []),
        ]
      }
    }
    return []
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
  case 'export-components':
    exportComponents().finally(() => figma.closePlugin())
    break
}
