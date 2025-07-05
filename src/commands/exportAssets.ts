import JSZip from 'jszip'

import { Element } from '../Element'
import { downloadFile } from '../utils/download-file'

export async function exportAssets() {
  const elements = await Promise.all(
    figma.currentPage.selection.map(async (node) => new Element(node)),
  )

  const assets = await Promise.all(
    elements.map(async (element) => element.getAssets()),
  )

  const assetCount = assets.reduce(
    (acc, asset) => acc + Object.keys(asset).length,
    0,
  )

  if (assetCount === 0) {
    figma.notify('No assets found', {
      timeout: 3000,
      error: true,
    })
    return
  }

  figma.notify(`Assets exported ${assetCount} assets`, {
    timeout: 3000,
  })
  const zip = new JSZip()
  for (const asset of assets) {
    for (const [name, data] of Object.entries(asset)) {
      zip.file(name, await data())
    }
  }

  await Promise.all(
    assets.map(async (asset) => {
      return Object.entries(asset).map(async ([name, data]) => {
        const content = await data()
        zip.file(name, content)
      })
    }),
  )
  await downloadFile(
    `${figma.currentPage.name}.zip`,
    await zip.generateAsync({ type: 'uint8array' }),
  )
  figma.notify('Assets exported', {
    timeout: 3000,
  })
}
