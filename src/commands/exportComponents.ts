import JSZip from 'jszip'

import { Element } from '../Element'
import { downloadFile } from '../utils/download-file'

export async function exportComponents() {
  try {
    figma.notify('Exporting components...')
    const elements = await Promise.all(
      figma.currentPage.selection.map(async (node) => new Element(node)),
    )

    const components = await Promise.all(
      elements.map((element) => element.getComponents()),
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
      for (const [name, data] of Object.entries(component)) {
        zip.file(name, await data())
      }
    }

    await Promise.all(
      components.map(async (component) => {
        return Object.entries(component).map(async ([name, data]) => {
          const content = await data()
          zip.file(name, content)
        })
      }),
    )
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
