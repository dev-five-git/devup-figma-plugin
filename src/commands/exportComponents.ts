import JSZip from 'jszip'

import { Codegen } from '../codegen/Codegen'
import { downloadFile } from '../utils/download-file'

export async function exportComponents() {
  try {
    figma.notify('Exporting components...')
    const elements = await Promise.all(
      figma.currentPage.selection.map(async (node) => new Codegen(node)),
    )
    await Promise.all(elements.map((element) => element.run()))

    const components = await Promise.all(
      elements.map((element) => element.getComponentsCodes()),
    )

    const componentCount = components.reduce(
      (acc, component) => acc + Object.keys(component).length,
      0,
    )

    if (componentCount === 0) {
      figma.notify('No components found')
      return
    }

    figma.notify(`Components exported ${componentCount} components`, {
      timeout: 3000,
    })
    const zip = new JSZip()
    for (const component of components) {
      for (const [_, codeList] of Object.entries(component)) {
        for (const [name, code] of codeList) {
          zip.file(name, code)
        }
      }
    }

    await downloadFile(
      `${figma.currentPage.name}.zip`,
      await zip.generateAsync({ type: 'uint8array' }),
    )
    figma.notify('Components exported', {
      timeout: 3000,
    })
  } catch (error) {
    console.error(error)
    figma.notify('Error exporting components', {
      timeout: 3000,
      error: true,
    })
  }
}
