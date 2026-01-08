import JSZip from 'jszip'

import { Codegen } from '../codegen/Codegen'
import { ResponsiveCodegen } from '../codegen/responsive/ResponsiveCodegen'
import { wrapComponent } from '../codegen/utils/wrap-component'
import { getComponentName } from '../utils'
import { downloadFile } from '../utils/download-file'
import { toPascal } from '../utils/to-pascal'

export const DEVUP_COMPONENTS = [
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

  const componentUsageRegex = /<([A-Z][a-zA-Z0-9]*)/g
  const matches = allCode.matchAll(componentUsageRegex)
  for (const match of matches) {
    const componentName = match[1]
    if (!DEVUP_COMPONENTS.includes(componentName)) {
      customImports.add(componentName)
    }
  }

  return Array.from(customImports).sort()
}

export function generateImportStatements(
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

export async function exportPagesAndComponents() {
  let notificationHandler = figma.notify('Preparing export...', {
    timeout: Infinity,
  })

  try {
    const zip = new JSZip()
    const componentsFolder = zip.folder('components')
    const pagesFolder = zip.folder('pages')

    let componentCount = 0
    let pageCount = 0

    // Track processed COMPONENT_SETs to avoid duplicates
    const processedComponentSets = new Set<string>()

    // Use selection if available, otherwise use all top-level children of current page
    const nodes = Array.from(
      figma.currentPage.selection.length > 0
        ? figma.currentPage.selection
        : figma.currentPage.children,
    )
    const totalNodes = nodes.length
    let processedNodes = 0

    // Helper to update progress
    function updateProgress(message: string) {
      const percent = Math.round((processedNodes / totalNodes) * 100)
      notificationHandler.cancel()
      notificationHandler = figma.notify(`[${percent}%] ${message}`, {
        timeout: Infinity,
      })
    }

    // Helper function to process a COMPONENT_SET
    async function processComponentSet(componentSet: ComponentSetNode) {
      if (processedComponentSets.has(componentSet.id)) return

      processedComponentSets.add(componentSet.id)
      const componentName = getComponentName(componentSet)

      updateProgress(`Processing component: ${componentName}`)

      const responsiveCodes =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          componentName,
        )

      for (const [name, code] of responsiveCodes) {
        const importStatement = generateImportStatements([[name, code]])
        const fullCode = importStatement + code
        componentsFolder?.file(`${name}.tsx`, fullCode)
        componentCount++
      }

      // Capture screenshot of the component set
      try {
        const imageData = await componentSet.exportAsync({
          format: 'PNG',
          constraint: { type: 'SCALE', value: 1 },
        })
        componentsFolder?.file(`${componentName}.png`, imageData)
      } catch (e) {
        console.error(`Failed to capture screenshot for ${componentName}:`, e)
      }
    }

    // Process each node
    for (const node of nodes) {
      processedNodes++

      // 1. Handle COMPONENT_SET directly
      if (node.type === 'COMPONENT_SET') {
        await processComponentSet(node as ComponentSetNode)
        continue
      }

      // 2. Handle COMPONENT - check if parent is COMPONENT_SET
      if (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') {
        await processComponentSet(node.parent as ComponentSetNode)
        continue
      }

      updateProgress(`Processing: ${node.name}`)

      // 3. Extract components using Codegen for other node types
      const codegen = new Codegen(node)
      await codegen.run()

      const componentsCodes = codegen.getComponentsCodes()
      const componentNodes = codegen.getComponentNodes()

      // Add component files
      for (const [name, code] of componentsCodes) {
        const importStatement = generateImportStatements([[name, code]])
        const fullCode = importStatement + code
        componentsFolder?.file(`${name}.tsx`, fullCode)
        componentCount++
      }

      // 4. Generate responsive codes for COMPONENT_SET components found inside
      for (const componentNode of componentNodes) {
        if (
          componentNode.type === 'COMPONENT' &&
          componentNode.parent?.type === 'COMPONENT_SET'
        ) {
          await processComponentSet(componentNode.parent as ComponentSetNode)
        }
      }

      // 5. Check if node is Section or has parent Section for page generation
      const isNodeSection = ResponsiveCodegen.canGenerateResponsive(node)
      const parentSection = ResponsiveCodegen.hasParentSection(node)
      const sectionNode = isNodeSection ? (node as SectionNode) : parentSection

      if (sectionNode) {
        const isParentSection = !isNodeSection && parentSection !== null

        updateProgress(`Generating page: ${sectionNode.name}`)

        const responsiveCodegen = new ResponsiveCodegen(sectionNode)
        const responsiveCode = await responsiveCodegen.generateResponsiveCode()
        const baseName = toPascal(sectionNode.name)
        const pageName = isParentSection ? `${baseName}Page` : baseName
        const wrappedCode = wrapComponent(pageName, responsiveCode, {
          exportDefault: isParentSection,
        })

        const pageCodeEntry: ReadonlyArray<readonly [string, string]> = [
          [pageName, wrappedCode],
        ]
        const importStatement = generateImportStatements(pageCodeEntry)
        const fullCode = importStatement + wrappedCode

        pagesFolder?.file(`${pageName}.tsx`, fullCode)

        // Capture screenshot of the section
        updateProgress(`Capturing screenshot: ${pageName}`)
        try {
          const imageData = await sectionNode.exportAsync({
            format: 'PNG',
            constraint: { type: 'SCALE', value: 1 },
          })
          pagesFolder?.file(`${pageName}.png`, imageData)
        } catch (e) {
          console.error(`Failed to capture screenshot for ${pageName}:`, e)
        }

        pageCount++
      }
    }

    // Check if we have anything to export
    if (componentCount === 0 && pageCount === 0) {
      notificationHandler.cancel()
      figma.notify('No components or pages found')
      return
    }

    notificationHandler.cancel()
    notificationHandler = figma.notify('[100%] Creating zip file...', {
      timeout: Infinity,
    })

    await downloadFile(
      `${figma.currentPage.name}-export.zip`,
      await zip.generateAsync({ type: 'uint8array' }),
    )

    notificationHandler.cancel()
    figma.notify(
      `Exported ${componentCount} components and ${pageCount} pages`,
      { timeout: 3000 },
    )
  } catch (error) {
    console.error(error)
    notificationHandler.cancel()
    figma.notify('Error exporting pages and components', {
      timeout: 3000,
      error: true,
    })
  }
}
