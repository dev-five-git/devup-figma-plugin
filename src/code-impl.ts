import { Codegen } from './codegen/Codegen'
import { ResponsiveCodegen } from './codegen/responsive/ResponsiveCodegen'
import { exportDevup, importDevup } from './commands/devup'
import { exportAssets } from './commands/exportAssets'
import { exportComponents } from './commands/exportComponents'

export function registerCodegen(ctx: typeof figma) {
  if (ctx.editorType === 'dev' && ctx.mode === 'codegen') {
    ctx.codegen.on('generate', async ({ node, language }) => {
      switch (language) {
        case 'devup-ui': {
          const time = Date.now()
          const codegen = new Codegen(node)
          await codegen.run()
          const componentsCodes = codegen.getComponentsCodes()
          console.info(`[benchmark] devup-ui end ${Date.now() - time}ms`)

          // 반응형 코드 생성 (부모가 Section인 경우)
          const parentSection = ResponsiveCodegen.hasParentSection(node)
          let responsiveResult: {
            title: string
            language: 'TYPESCRIPT'
            code: string
          }[] = []

          if (parentSection) {
            try {
              const responsiveCodegen = new ResponsiveCodegen(parentSection)
              const responsiveCode =
                await responsiveCodegen.generateResponsiveCode()
              responsiveResult = [
                {
                  title: `${parentSection.name} - Responsive`,
                  language: 'TYPESCRIPT' as const,
                  code: responsiveCode,
                },
              ]
            } catch (e) {
              console.error('[responsive] Error generating responsive code:', e)
            }
          }

          return [
            ...(node.type === 'COMPONENT' ||
            node.type === 'COMPONENT_SET' ||
            node.type === 'INSTANCE'
              ? []
              : [
                  {
                    title: node.name,
                    language: 'TYPESCRIPT',
                    code: codegen.getCode(),
                  } as const,
                ]),
            ...(componentsCodes.length > 0
              ? ([
                  {
                    title: `${node.name} - Components`,
                    language: 'TYPESCRIPT',
                    code: componentsCodes.map((code) => code[1]).join('\n\n'),
                  },
                  {
                    title: `${node.name} - Components CLI`,
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
            ...responsiveResult,
          ]
        }
      }
      return []
    })
  }
}

export function runCommand(ctx: typeof figma = figma) {
  switch (ctx.command) {
    case 'export-devup':
      exportDevup('json').finally(() => ctx.closePlugin())
      break
    case 'export-devup-without-treeshaking':
      exportDevup('json', false).finally(() => ctx.closePlugin())
      break
    case 'export-devup-excel':
      exportDevup('excel').finally(() => ctx.closePlugin())
      break
    case 'export-devup-excel-without-treeshaking':
      exportDevup('excel', false).finally(() => ctx.closePlugin())
      break
    case 'import-devup':
      importDevup('json').finally(() => ctx.closePlugin())
      break
    case 'import-devup-excel':
      importDevup('excel').finally(() => ctx.closePlugin())
      break
    case 'export-assets':
      exportAssets().finally(() => ctx.closePlugin())
      break
    case 'export-components':
      exportComponents().finally(() => ctx.closePlugin())
      break
  }
}

export function run(ctx: typeof figma) {
  if (typeof ctx !== 'undefined') {
    registerCodegen(ctx)
    runCommand(ctx)
  }
}

export function autoRun(ctx: typeof figma | undefined = figma) {
  if (typeof ctx !== 'undefined') {
    run(ctx)
  }
}
