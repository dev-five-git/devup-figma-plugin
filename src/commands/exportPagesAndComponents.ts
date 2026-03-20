import JSZip from 'jszip'

import {
  Codegen,
  getGlobalAssetNodes,
  resetGlobalAssetNodes,
} from '../codegen/Codegen'
import { ResponsiveCodegen } from '../codegen/responsive/ResponsiveCodegen'
import { checkAssetNode } from '../codegen/utils/check-asset-node'
import {
  perfEnd,
  perfReport,
  perfReset,
  perfStart,
} from '../codegen/utils/perf'
import { wrapComponent } from '../codegen/utils/wrap-component'
import { getComponentName } from '../utils'
import { downloadFile } from '../utils/download-file'
import { toPascal } from '../utils/to-pascal'
import { buildDevupConfig } from './devup'

const NOTIFY_TIMEOUT = 3000
// Figma throttles >4 concurrent exportAsync calls for large PNGs (screenshots).
// SVG/asset exports are lightweight and scale better with higher concurrency.
const SCREENSHOT_BATCH_SIZE = 4
const ASSET_BATCH_SIZE = 8
const ZIP_TEXT_FILE_OPTIONS = { compression: 'DEFLATE' as const }
const ZIP_BINARY_FILE_OPTIONS = { binary: true, compression: 'STORE' as const }
const ZIP_GENERATE_OPTIONS = {
  type: 'uint8array' as const,
  compression: 'DEFLATE' as const,
  compressionOptions: { level: 1 },
  streamFiles: true,
}

export const DEVUP_COMPONENTS = [
  'Center',
  'VStack',
  'Flex',
  'Grid',
  'Box',
  'Text',
  'Image',
]
const DEVUP_COMPONENT_SET = new Set(DEVUP_COMPONENTS)
const DEVUP_COMPONENT_PATTERNS = DEVUP_COMPONENTS.map(
  (component) => [component, new RegExp(`<${component}[\\s/>]`)] as const,
)
const CUSTOM_COMPONENT_USAGE_REGEX = /<([A-Z][a-zA-Z0-9]*)/g

function getCombinedCode(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string {
  let allCode = ''
  for (let i = 0; i < componentsCodes.length; i++) {
    if (i > 0) allCode += '\n'
    allCode += componentsCodes[i][1]
  }
  return allCode
}

export function extractImports(
  componentsCodes: ReadonlyArray<readonly [string, string]>,
): string[] {
  const allCode = getCombinedCode(componentsCodes)
  const imports = new Set<string>()

  for (const [component, regex] of DEVUP_COMPONENT_PATTERNS) {
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
  const allCode = getCombinedCode(componentsCodes)
  const customImports = new Set<string>()

  CUSTOM_COMPONENT_USAGE_REGEX.lastIndex = 0
  for (const match of allCode.matchAll(CUSTOM_COMPONENT_USAGE_REGEX)) {
    const componentName = match[1]
    if (!DEVUP_COMPONENT_SET.has(componentName)) {
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

type AnnotatedNode = SceneNode & {
  annotations: ReadonlyArray<{ label?: string; labelMarkdown?: string }>
}

/**
 * Collect notes from a section: standalone TEXT children (annotations by convention)
 * and Figma dev-mode annotations on descendant nodes.
 * Returns the combined text, or empty string if none found.
 */
export function collectSectionNotes(section: SectionNode): string {
  const lines: string[] = []

  // 1. Direct TEXT children are treated as page annotations
  for (const child of section.children) {
    if (child.type === 'TEXT') {
      const text = (child as TextNode).characters.trim()
      if (text) lines.push(text)
    }
  }

  // 2. Figma dev-mode annotations on any descendant node
  const annotatedNodes = section.findAll(
    (node) =>
      'annotations' in node && (node as AnnotatedNode).annotations.length > 0,
  )
  for (const node of annotatedNodes) {
    for (const annotation of (node as AnnotatedNode).annotations) {
      const text = (annotation.label ?? annotation.labelMarkdown ?? '').trim()
      if (text) lines.push(`[${node.name}] ${text}`)
    }
  }

  return lines.join('\n')
}

interface ScreenshotTarget {
  node: SceneNode
  folder: JSZip
  fileName: string
}

/**
 * Recursively collect asset nodes (SVGs and PNGs) from a Figma node tree.
 * Uses checkAssetNode to identify assets. Deduplicates by type + name.
 * Does not descend into children of asset nodes (they are leaf nodes in codegen).
 *
 * Pass a `visited` set to skip already-walked subtrees when collecting
 * from multiple overlapping roots (e.g. top-level nodes + external component sets).
 */
export function collectAssetNodes(
  node: SceneNode,
  assets: Map<string, { node: SceneNode; type: 'svg' | 'png' }>,
  visited?: Set<string>,
): void {
  if (!node.visible) return
  if (visited) {
    const id = (node as SceneNode & { id?: string }).id
    if (id) {
      if (visited.has(id)) return
      visited.add(id)
    }
  }
  const assetType = checkAssetNode(node)
  if (assetType) {
    const key = `${assetType}/${node.name}`
    if (!assets.has(key)) {
      assets.set(key, { node, type: assetType })
    }
    return
  }
  if ('children' in node) {
    for (const child of (node as SceneNode & ChildrenMixin).children) {
      collectAssetNodes(child, assets, visited)
    }
  }
}

export async function exportPagesAndComponents() {
  let notificationHandler = figma.notify('Preparing export...', {
    timeout: Infinity,
  })

  try {
    perfReset()
    const tTotal = perfStart()

    const zip = new JSZip()
    const componentsFolder = zip.folder('components')
    const pagesFolder = zip.folder('pages')
    const iconsFolder = zip.folder('icons')
    const imagesFolder = zip.folder('images')

    let componentCount = 0
    let pageCount = 0

    // Deferred work collectors
    const screenshotTargets: ScreenshotTarget[] = []

    // Fire devup config build early — runs in parallel with codegen
    const devupConfigPromise = buildDevupConfig()

    // Reset global asset registry so buildTree() populates it fresh
    resetGlobalAssetNodes()

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

    // Throttled notification — avoids cancel/recreate churn on rapid progress
    let lastNotifyTime = 0
    function updateProgress(message: string, force = false) {
      const now = Date.now()
      if (!force && now - lastNotifyTime < 200) return
      lastNotifyTime = now
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

      let t = perfStart()
      const responsiveCodes =
        await ResponsiveCodegen.generateVariantResponsiveComponents(
          componentSet,
          componentName,
        )
      perfEnd(`responsiveCodegen(${componentName})`, t)

      t = perfStart()
      for (const [name, code] of responsiveCodes) {
        const importStatement = generateImportStatements([[name, code]])
        const fullCode = importStatement + code
        componentsFolder?.file(`${name}.tsx`, fullCode, ZIP_TEXT_FILE_OPTIONS)
        componentCount++
      }
      perfEnd('writeComponentFiles', t)

      // Defer screenshot capture
      if (componentsFolder) {
        screenshotTargets.push({
          node: componentSet,
          folder: componentsFolder,
          fileName: `${componentName}.png`,
        })
      }
    }

    // Process each node
    const tCodegen = perfStart()
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
      let t = perfStart()
      const codegen = new Codegen(node)
      await codegen.run()
      perfEnd(`codegen(${node.name})`, t)

      t = perfStart()
      const componentsCodes = codegen.getComponentsCodes()
      const componentNodes = codegen.getComponentNodes()

      // Add component files
      for (const [name, code] of componentsCodes) {
        const importStatement = generateImportStatements([[name, code]])
        const fullCode = importStatement + code
        componentsFolder?.file(`${name}.tsx`, fullCode, ZIP_TEXT_FILE_OPTIONS)
        componentCount++
      }
      perfEnd('writeComponentFiles', t)

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

        t = perfStart()
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

        pagesFolder?.file(`${pageName}.tsx`, fullCode, ZIP_TEXT_FILE_OPTIONS)
        perfEnd(`responsivePage(${pageName})`, t)

        // Collect section notes (standalone TEXT children + annotations)
        const notes = collectSectionNotes(sectionNode)
        if (notes && pagesFolder) {
          pagesFolder.file(`${pageName}.txt`, notes, ZIP_TEXT_FILE_OPTIONS)
        }

        // Defer screenshot capture
        if (pagesFolder) {
          screenshotTargets.push({
            node: sectionNode,
            folder: pagesFolder,
            fileName: `${pageName}.png`,
          })
        }

        pageCount++
      }
    }
    perfEnd('phase1.codegen', tCodegen)

    // Check if we have anything to export
    if (componentCount === 0 && pageCount === 0) {
      notificationHandler.cancel()
      figma.notify('No components or pages found')
      return
    }

    // Await devup config (started in parallel with codegen) and add to ZIP
    const devupConfig = await devupConfigPromise
    zip.file('devup.json', JSON.stringify(devupConfig), ZIP_TEXT_FILE_OPTIONS)

    // Asset nodes were already collected by Codegen's buildTree() into the
    // global registry — no need to re-walk the Figma node tree via IPC.
    const assetNodes = getGlobalAssetNodes()

    // Phase 2: Batch export screenshots and assets in parallel
    const tExport = perfStart()
    const totalExports = screenshotTargets.length + assetNodes.size
    let completedExports = 0

    function updateExportProgress(label: string) {
      const now = Date.now()
      if (now - lastNotifyTime < 200) return
      lastNotifyTime = now
      const percent = Math.round((completedExports / totalExports) * 100)
      notificationHandler.cancel()
      notificationHandler = figma.notify(`Exporting [${percent}%] ${label}`, {
        timeout: Infinity,
      })
    }

    // Export screenshots in parallel batches
    const tScreenshots = perfStart()
    for (let i = 0; i < screenshotTargets.length; i += SCREENSHOT_BATCH_SIZE) {
      const batch = screenshotTargets.slice(i, i + SCREENSHOT_BATCH_SIZE)
      updateExportProgress(`screenshots (${i + 1}/${screenshotTargets.length})`)
      await Promise.all(
        batch.map(async ({ node, folder, fileName }) => {
          try {
            const t = perfStart()
            const imageData = await node.exportAsync({
              format: 'PNG',
              constraint: { type: 'SCALE', value: 1 },
            })
            folder.file(fileName, imageData, ZIP_BINARY_FILE_OPTIONS)
            perfEnd('exportAsync(screenshot)', t)
            completedExports++
          } catch (e) {
            console.error(`Failed to capture screenshot for ${fileName}:`, e)
            completedExports++
          }
        }),
      )
    }
    perfEnd('phase2.screenshots', tScreenshots)

    // Export asset files in parallel batches (SVGs → icons/, PNGs → images/)
    const tAssets = perfStart()
    const assetEntries = [...assetNodes.values()]
    let assetCount = 0
    for (let i = 0; i < assetEntries.length; i += ASSET_BATCH_SIZE) {
      const batch = assetEntries.slice(i, i + ASSET_BATCH_SIZE)
      updateExportProgress(`assets (${i + 1}/${assetEntries.length})`)
      await Promise.all(
        batch.map(async ({ node, type }) => {
          try {
            const fileName = `${node.name}.${type}`
            const t = perfStart()
            if (type === 'svg') {
              const svgData = await node.exportAsync({ format: 'SVG' })
              iconsFolder?.file(fileName, svgData, ZIP_BINARY_FILE_OPTIONS)
            } else {
              const pngData = await node.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 2 },
              })
              imagesFolder?.file(fileName, pngData, ZIP_BINARY_FILE_OPTIONS)
            }
            perfEnd(`exportAsync(${type})`, t)
            assetCount++
            completedExports++
          } catch (e) {
            console.error(`Failed to export asset ${node.name}:`, e)
            completedExports++
          }
        }),
      )
    }
    perfEnd('phase2.assets', tAssets)
    perfEnd('phase2.export', tExport)

    notificationHandler.cancel()
    notificationHandler = figma.notify('[100%] Creating zip file...', {
      timeout: Infinity,
    })

    const tZip = perfStart()
    await downloadFile(
      `${figma.currentPage.name}-export.zip`,
      await zip.generateAsync(ZIP_GENERATE_OPTIONS),
    )
    perfEnd('phase3.zip', tZip)

    perfEnd('exportPagesAndComponents()', tTotal)
    console.info(perfReport())

    notificationHandler.cancel()

    const parts = [`${componentCount} components`, `${pageCount} pages`]
    if (assetCount > 0) {
      parts.push(`${assetCount} assets`)
    }
    figma.notify(`Exported ${parts.join(', ')}`, { timeout: NOTIFY_TIMEOUT })
  } catch (error) {
    console.error(error)
    notificationHandler.cancel()
    figma.notify('Error exporting pages and components', {
      timeout: NOTIFY_TIMEOUT,
      error: true,
    })
  }
}
