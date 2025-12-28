import { Codegen } from './codegen/Codegen'
import { ResponsiveCodegen } from './codegen/responsive/ResponsiveCodegen'
import { nodeProxyTracker } from './codegen/utils/node-proxy'
import { exportDevup, importDevup } from './commands/devup'
import { exportAssets } from './commands/exportAssets'
import { exportComponents } from './commands/exportComponents'
import { getComponentName } from './utils'

const DEVUP_COMPONENTS = [
  'Center',
  'VStack',
  'Flex',
  'Grid',
  'Box',
  'Text',
  'Image',
]

export function extractImports(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string[] {
  const allCode = componentsCodes.map(([_, code]) => code).join('\n')
  const imports = new Set<string>()

  for (const component of DEVUP_COMPONENTS) {
    const regex = new RegExp(`<${component}[\\s/>]`, 'g')
    if (regex.test(allCode)) {
      imports.add(component)
    }
  }

  if (/\bkeyframes\s*(\(|`)/.test(allCode)) {
    imports.add('keyframes')
  }

  return Array.from(imports).sort()
}

export function extractCustomComponentImports(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string[] {
  const allCode = componentsCodes.map(([_, code]) => code).join('\n')
  const customImports = new Set<string>()

  // Find all component usages in JSX: <ComponentName or <ComponentName>
  const componentUsageRegex = /<([A-Z][a-zA-Z0-9]*)/g
  const matches = allCode.matchAll(componentUsageRegex)
  for (const match of matches) {
    const componentName = match[1]
    // Skip devup-ui components and components defined in this code
    if (!DEVUP_COMPONENTS.includes(componentName)) {
      customImports.add(componentName)
    }
  }

  return Array.from(customImports).sort()
}

function generateImportStatements(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string {
  const devupImports = extractImports(componentsCodes)
  const customImports = extractCustomComponentImports(componentsCodes)

  const statements: string[] = []

  if (devupImports.length > 0) {
    statements.push(
      `import { ${devupImports.join(', ')} } from '@devup-ui/react'`,
    )
  }

  for (const componentName of customImports) {
    statements.push(
      `import { ${componentName} } from '@/components/${componentName}'`,
    )
  }

  return statements.length > 0 ? `${statements.join('\n')}\n\n` : ''
}

function generateBashCLI(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string {
  const importStatement = generateImportStatements(componentsCodes)

  const commands = [
    'mkdir -p src/components',
    '',
    ...componentsCodes.map(([componentName, code]) => {
      const fullCode = importStatement + code
      const escapedCode = fullCode.replace(/'/g, "\\'")
      return `echo '${escapedCode}' > src/components/${componentName}.tsx`
    }),
  ]

  return commands.join('\n')
}

function generatePowerShellCLI(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string {
  const importStatement = generateImportStatements(componentsCodes)

  const commands = [
    'New-Item -ItemType Directory -Force -Path src\\components | Out-Null',
    '',
    ...componentsCodes.map(([componentName, code]) => {
      const fullCode = importStatement + code
      return `@'\n${fullCode}\n'@ | Out-File -FilePath src\\components\\${componentName}.tsx -Encoding UTF8`
    }),
  ]

  return commands.join('\n')
}

const debug = false

export function registerCodegen(ctx: typeof figma) {
  if (ctx.editorType === 'dev' && ctx.mode === 'codegen') {
    ctx.codegen.on('generate', async ({ node: n, language }) => {
      const node = debug ? nodeProxyTracker.wrap(n) : n
      switch (language) {
        case 'devup-ui': {
          const time = Date.now()
          const codegen = new Codegen(node)
          await codegen.run()
          const componentsCodes = codegen.getComponentsCodes()

          // Generate responsive component codes with variant support
          let responsiveComponentsCodes: ReadonlyArray<
            readonly [string, string]
          > = []
          if (node.type === 'COMPONENT_SET') {
            const componentName = getComponentName(node)
            responsiveComponentsCodes =
              await ResponsiveCodegen.generateVariantResponsiveComponents(
                node,
                componentName,
              )
          }

          console.info(`[benchmark] devup-ui end ${Date.now() - time}ms`)

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
          if (debug) {
            console.log(
              await nodeProxyTracker.toTestCaseFormatWithVariables(node.id),
            )
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
                    title: `${node.name} - Components CLI (Bash)`,
                    language: 'BASH',
                    code: generateBashCLI(componentsCodes),
                  },
                  {
                    title: `${node.name} - Components CLI (PowerShell)`,
                    language: 'BASH',
                    code: generatePowerShellCLI(componentsCodes),
                  },
                ] as const)
              : []),
            ...(responsiveComponentsCodes.length > 0
              ? [
                  {
                    title: `${node.name} - Components Responsive`,
                    language: 'TYPESCRIPT' as const,
                    code: responsiveComponentsCodes
                      .map((code) => code[1])
                      .join('\n\n'),
                  },
                ]
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
