import JSZip from 'jszip'

import { Codegen } from '../codegen/Codegen'
import { downloadFile } from '../utils/download-file'

const NOTIFY_TIMEOUT = 3000
const ZIP_TEXT_FILE_OPTIONS = { compression: 'DEFLATE' as const }
const ZIP_GENERATE_OPTIONS = {
  type: 'uint8array' as const,
  compression: 'DEFLATE' as const,
  compressionOptions: { level: 1 },
  streamFiles: true,
}

export async function exportComponents() {
  try {
    figma.notify('Exporting components...')
    const elements = figma.currentPage.selection.map(
      (node) => new Codegen(node),
    )
    await Promise.all(elements.map((element) => element.run()))

    const components = elements.map((element) => element.getComponentsCodes())

    const componentCount = components.reduce(
      (acc, component) => acc + component.length,
      0,
    )

    if (componentCount === 0) {
      figma.notify('No components found')
      return
    }

    figma.notify(`Components exported ${componentCount} components`, {
      timeout: NOTIFY_TIMEOUT,
    })
    const zip = new JSZip()
    for (const codeList of components) {
      for (const [name, code] of codeList) {
        zip.file(name, code, ZIP_TEXT_FILE_OPTIONS)
      }
    }

    await downloadFile(
      `${figma.currentPage.name}.zip`,
      await zip.generateAsync(ZIP_GENERATE_OPTIONS),
    )
    figma.notify('Components exported', {
      timeout: NOTIFY_TIMEOUT,
    })
  } catch (error) {
    console.error(error)
    figma.notify('Error exporting components', {
      timeout: NOTIFY_TIMEOUT,
      error: true,
    })
  }
}
