import {
  Codegen,
  resetGlobalBuildTreeCache,
  resetMainComponentCache,
} from './codegen/Codegen'
import { resetGetPropsCache } from './codegen/props'
import { resetChildAnimationCache } from './codegen/props/reaction'
import {
  resetSelectorPropsCache,
  sanitizePropertyName,
} from './codegen/props/selector'
import { ResponsiveCodegen } from './codegen/responsive/ResponsiveCodegen'
import { isReservedVariantKey } from './codegen/utils/extract-instance-variant-props'
import { nodeProxyTracker } from './codegen/utils/node-proxy'
import { perfEnd, perfReport, perfReset, perfStart } from './codegen/utils/perf'
import { resetVariableCache } from './codegen/utils/variable-cache'
import { wrapComponent } from './codegen/utils/wrap-component'
import { exportDevup, importDevup } from './commands/devup'
import { exportAssets } from './commands/exportAssets'
import { exportComponents } from './commands/exportComponents'
import {
  exportPagesAndComponents,
  extractCustomComponentImports,
  extractImports,
} from './commands/exportPagesAndComponents'
export { extractCustomComponentImports, extractImports }

import { getComponentName, resetTextStyleCache } from './utils'
import { toPascal } from './utils/to-pascal'

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

export function generateComponentUsage(node: SceneNode): string | null {
  const componentName = getComponentName(node)

  if (node.type === 'COMPONENT') {
    const variantProps = (node as ComponentNode).variantProperties

    const entries: { key: string; value: string; type: string }[] = []
    if (variantProps) {
      for (const [key, value] of Object.entries(variantProps)) {
        if (!isReservedVariantKey(key)) {
          entries.push({
            key: sanitizePropertyName(key),
            value,
            type: 'VARIANT',
          })
        }
      }
    }

    // Also include BOOLEAN/TEXT properties from parent COMPONENT_SET
    const parentSet =
      (node as ComponentNode).parent?.type === 'COMPONENT_SET'
        ? ((node as ComponentNode).parent as ComponentSetNode)
        : null
    const defs = parentSet?.componentPropertyDefinitions
    let textEntry: { key: string; value: string } | null = null
    let textCount = 0
    if (defs) {
      for (const [key, def] of Object.entries(defs)) {
        if (isReservedVariantKey(key)) continue
        if (def.type === 'BOOLEAN' && def.defaultValue) {
          entries.push({
            key: sanitizePropertyName(key),
            value: 'true',
            type: 'BOOLEAN',
          })
        } else if (def.type === 'TEXT') {
          textCount++
          textEntry = {
            key: sanitizePropertyName(key),
            value: String(def.defaultValue),
          }
          entries.push({
            key: sanitizePropertyName(key),
            value: String(def.defaultValue),
            type: 'TEXT',
          })
        }
      }
    }

    if (textCount === 1 && textEntry) {
      const filteredEntries = entries.filter((e) => e.type !== 'TEXT')
      if (filteredEntries.length === 0)
        return `<${componentName}>${textEntry.value}</${componentName}>`
      const propsStr = filteredEntries
        .map((e) => {
          if (e.type === 'BOOLEAN') return e.key
          return `${e.key}="${e.value}"`
        })
        .join(' ')
      return `<${componentName} ${propsStr}>${textEntry.value}</${componentName}>`
    }

    if (entries.length === 0) return `<${componentName} />`
    const propsStr = entries
      .map((e) => {
        if (e.type === 'BOOLEAN') return e.key
        return `${e.key}="${e.value}"`
      })
      .join(' ')
    return `<${componentName} ${propsStr} />`
  }

  if (node.type === 'COMPONENT_SET') {
    const defs = (node as ComponentSetNode).componentPropertyDefinitions
    if (!defs) return `<${componentName} />`

    const entries: { key: string; value: string; type: string }[] = []
    let textEntry: { key: string; value: string } | null = null
    let textCount = 0
    for (const [key, def] of Object.entries(defs)) {
      if (isReservedVariantKey(key)) continue
      const sanitizedKey = sanitizePropertyName(key)
      if (def.type === 'VARIANT') {
        entries.push({
          key: sanitizedKey,
          value: String(def.defaultValue),
          type: 'VARIANT',
        })
      } else if (def.type === 'BOOLEAN') {
        if (def.defaultValue) {
          entries.push({ key: sanitizedKey, value: 'true', type: 'BOOLEAN' })
        }
      } else if (def.type === 'TEXT') {
        textCount++
        textEntry = { key: sanitizedKey, value: String(def.defaultValue) }
        entries.push({
          key: sanitizedKey,
          value: String(def.defaultValue),
          type: 'TEXT',
        })
      }
    }

    if (textCount === 1 && textEntry) {
      const filteredEntries = entries.filter((e) => e.type !== 'TEXT')
      if (filteredEntries.length === 0)
        return `<${componentName}>${textEntry.value}</${componentName}>`
      const propsStr = filteredEntries
        .map((e) => {
          if (e.type === 'BOOLEAN') return e.key
          return `${e.key}="${e.value}"`
        })
        .join(' ')
      return `<${componentName} ${propsStr}>${textEntry.value}</${componentName}>`
    }

    if (entries.length === 0) return `<${componentName} />`
    const propsStr = entries
      .map((e) => {
        if (e.type === 'BOOLEAN') return e.key
        return `${e.key}="${e.value}"`
      })
      .join(' ')
    return `<${componentName} ${propsStr} />`
  }

  return null
}

const debug = true

export function registerCodegen(ctx: typeof figma) {
  if (ctx.editorType === 'dev' && ctx.mode === 'codegen') {
    ctx.codegen.on('generate', async ({ node: n, language }) => {
      // Use the raw node for codegen (no Proxy overhead).
      // Debug tracking happens AFTER codegen completes via separate walk.
      const node = n
      switch (language) {
        case 'devup-ui': {
          const time = Date.now()
          perfReset()
          resetGetPropsCache()
          resetSelectorPropsCache()
          resetChildAnimationCache()
          resetVariableCache()
          resetTextStyleCache()
          resetMainComponentCache()
          resetGlobalBuildTreeCache()

          let t = perfStart()
          const codegen = new Codegen(node)
          await codegen.run()
          perfEnd('Codegen.run()', t)

          t = perfStart()
          const componentsCodes = codegen.getComponentsCodes()
          perfEnd('getComponentsCodes()', t)

          // Generate responsive component codes with variant support
          let responsiveComponentsCodes: ReadonlyArray<
            readonly [string, string]
          > = []
          if (node.type === 'COMPONENT_SET') {
            const componentName = getComponentName(node)
            // Reset the global build tree cache so that each variant's Codegen
            // instance runs doBuildTree fresh — this ensures addComponentTree fires
            // and BOOLEAN condition fields are populated on children.
            // Without this, cached trees from codegen.run() above would cause
            // buildTree to return early, skipping addComponentTree entirely.
            resetGlobalBuildTreeCache()
            t = perfStart()
            responsiveComponentsCodes =
              await ResponsiveCodegen.generateVariantResponsiveComponents(
                node,
                componentName,
              )
            perfEnd('generateVariantResponsiveComponents(COMPONENT_SET)', t)
          }

          // Generate responsive codes for components extracted from the page
          // Skip when the selected node itself is a COMPONENT or COMPONENT_SET,
          // because the self-referencing componentTree would trigger the parent
          // COMPONENT_SET to be fully expanded — producing ComponentSet-level output
          // when the user only wants to see their selected variant.
          let componentsResponsiveCodes: ReadonlyArray<
            readonly [string, string]
          > = []
          if (
            componentsCodes.length > 0 &&
            node.type !== 'COMPONENT' &&
            node.type !== 'COMPONENT_SET'
          ) {
            const componentNodes = codegen.getComponentNodes()
            const processedComponentSets = new Set<string>()
            const responsiveResults: Array<readonly [string, string]> = []

            for (const componentNode of componentNodes) {
              // Check if the component belongs to a COMPONENT_SET
              const parentSet =
                componentNode.type === 'COMPONENT' &&
                componentNode.parent?.type === 'COMPONENT_SET'
                  ? (componentNode.parent as ComponentSetNode)
                  : null

              if (parentSet && !processedComponentSets.has(parentSet.id)) {
                processedComponentSets.add(parentSet.id)
                const componentName = getComponentName(parentSet)
                // Reset global cache so addComponentTree fires for BOOLEAN conditions
                resetGlobalBuildTreeCache()
                t = perfStart()
                const responsiveCodes =
                  await ResponsiveCodegen.generateVariantResponsiveComponents(
                    parentSet,
                    componentName,
                  )
                perfEnd(
                  `generateVariantResponsiveComponents(${componentName})`,
                  t,
                )
                responsiveResults.push(...responsiveCodes)
              }
            }
            componentsResponsiveCodes = responsiveResults
          }

          // Check if node itself is SECTION or has a parent SECTION
          const isNodeSection = ResponsiveCodegen.canGenerateResponsive(node)
          const parentSection = ResponsiveCodegen.hasParentSection(node)
          const sectionNode = isNodeSection
            ? (node as SectionNode)
            : parentSection
          // When parent is Section (not node itself), use Page postfix and export default
          const isParentSection = !isNodeSection && parentSection !== null
          let responsiveResult: {
            title: string
            language: 'TYPESCRIPT' | 'BASH'
            code: string
          }[] = []

          if (sectionNode) {
            try {
              const responsiveCodegen = new ResponsiveCodegen(sectionNode)
              const responsiveCode =
                await responsiveCodegen.generateResponsiveCode()
              const baseName = toPascal(sectionNode.name)
              const sectionComponentName = isParentSection
                ? `${baseName}Page`
                : baseName
              const wrappedCode = wrapComponent(
                sectionComponentName,
                responsiveCode,
                { exportDefault: isParentSection },
              )
              const sectionCodes: ReadonlyArray<readonly [string, string]> = [
                [sectionComponentName, wrappedCode],
              ]
              const importStatement = generateImportStatements(sectionCodes)
              const fullCode = importStatement + wrappedCode

              responsiveResult = [
                {
                  title: `${sectionNode.name} - Responsive`,
                  language: 'TYPESCRIPT' as const,
                  code: fullCode,
                },
                {
                  title: `${sectionNode.name} - Responsive CLI (Bash)`,
                  language: 'BASH' as const,
                  code: generateBashCLI(sectionCodes),
                },
                {
                  title: `${sectionNode.name} - Responsive CLI (PowerShell)`,
                  language: 'BASH' as const,
                  code: generatePowerShellCLI(sectionCodes),
                },
              ]
            } catch (e) {
              console.error('[responsive] Error generating responsive code:', e)
            }
          }
          if (debug) {
            console.info(`[benchmark] devup-ui end ${Date.now() - time}ms`)
            console.info(perfReport())
            // Track AFTER codegen — collects all node properties for test case
            // generation without Proxy overhead during the hot codegen path.
            nodeProxyTracker.trackTree(node)
            console.log(
              await nodeProxyTracker.toTestCaseFormatWithVariables(node.id),
            )
          }

          // Generate usage snippet for component-type nodes
          const isComponentType =
            node.type === 'COMPONENT' ||
            node.type === 'COMPONENT_SET' ||
            node.type === 'INSTANCE'
          const usageResults: {
            title: string
            language: 'TYPESCRIPT'
            code: string
          }[] = []
          if (node.type === 'INSTANCE') {
            // For INSTANCE: extract clean component usage from the tree
            // (tree already has the correct component name from getMainComponentAsync)
            const tree = await codegen.getTree()
            const componentTree = tree.isComponent
              ? tree
              : tree.children.find((c) => c.isComponent)
            if (componentTree) {
              usageResults.push({
                title: 'Usage',
                language: 'TYPESCRIPT',
                code: Codegen.renderTree(componentTree, 0),
              })
            }
          } else if (
            node.type === 'COMPONENT' ||
            node.type === 'COMPONENT_SET'
          ) {
            const usage = generateComponentUsage(node)
            if (usage) {
              usageResults.push({
                title: 'Usage',
                language: 'TYPESCRIPT',
                code: usage,
              })
            }
          }

          const allComponentsCodes = [
            ...componentsResponsiveCodes,
            ...responsiveComponentsCodes,
          ]

          // For COMPONENT nodes, show both the single-variant code AND Usage.
          // For COMPONENT_SET and INSTANCE, show only Usage.
          // For all other types, show the main code.
          const showMainCode = !isComponentType || node.type === 'COMPONENT'

          return [
            ...usageResults,
            ...(showMainCode
              ? [
                  {
                    title: node.name,
                    language: 'TYPESCRIPT',
                    code: codegen.getCode(),
                  } as const,
                ]
              : []),
            ...(allComponentsCodes.length > 0
              ? [
                  {
                    title: `${node.name} - Components`,
                    language: 'TYPESCRIPT' as const,
                    code: allComponentsCodes
                      .map((code) => code[1])
                      .join('\n\n'),
                  },
                  {
                    title: `${node.name} - Components CLI (Bash)`,
                    language: 'BASH' as const,
                    code: generateBashCLI(allComponentsCodes),
                  },
                  {
                    title: `${node.name} - Components CLI (PowerShell)`,
                    language: 'BASH' as const,
                    code: generatePowerShellCLI(allComponentsCodes),
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
    case 'export-pages-and-components':
      exportPagesAndComponents().finally(() => ctx.closePlugin())
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
