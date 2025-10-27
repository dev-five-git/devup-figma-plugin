import { Codegen } from './codegen/Codegen'
import { wrapComponent } from './codegen/utils/wrap-component'
import { exportDevup, importDevup } from './commands/devup'
import { exportAssets } from './commands/exportAssets'
import { exportComponents } from './commands/exportComponents'
import { getComponentName } from './utils'

if (figma.editorType === 'dev' && figma.mode === 'codegen') {
  figma.codegen.on('generate', async ({ node, language }) => {
    switch (language) {
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
    exportDevup('json').finally(() => figma.closePlugin())
    break
  case 'export-devup-excel':
    exportDevup('excel').finally(() => figma.closePlugin())
    break
  case 'import-devup':
    importDevup('json').finally(() => figma.closePlugin())
    break
  case 'import-devup-excel':
    importDevup('excel').finally(() => figma.closePlugin())
    break
  case 'export-assets':
    exportAssets().finally(() => figma.closePlugin())
    break
  case 'export-components':
    exportComponents().finally(() => figma.closePlugin())
    break
}
