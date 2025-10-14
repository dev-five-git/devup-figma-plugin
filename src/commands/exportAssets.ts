import { Codegen } from '../codegen/Codegen'

export async function exportAssets() {
  // try {
  figma.notify('Exporting assets...')
  const elements = await Promise.all(
    figma.currentPage.selection.map(async (node) => new Codegen(node)),
  )
  await Promise.all(elements.map((element) => element.run()))

  // const assets = await Promise.all(
  //   elements.map(async (element) => element.getAssets()),
  // )

  //   const assetCount = assets.reduce(
  //     (acc, asset) => acc + Object.keys(asset).length,
  //     0,
  //   )

  //   if (assetCount === 0) {
  //     figma.notify('No assets found')
  //     return
  //   }

  //   figma.notify(`Assets exported ${assetCount} assets`, {
  //     timeout: 3000,
  //   })
  //   const zip = new JSZip()
  //   for (const asset of assets) {
  //     for (const [name, data] of Object.entries(asset)) {
  //       zip.file(name, await data())
  //     }
  //   }

  //   await Promise.all(
  //     assets.map(async (asset) => {
  //       return Object.entries(asset).map(async ([name, data]) => {
  //         const content = await data()
  //         zip.file(name, content)
  //       })
  //     }),
  //   )
  //   await downloadFile(
  //     `${figma.currentPage.name}.zip`,
  //     await zip.generateAsync({ type: 'uint8array' }),
  //   )
  //   figma.notify('Assets exported', {
  //     timeout: 3000,
  //   })
  // } catch (error) {
  //   console.error(error)
  //   figma.notify('Error exporting assets', {
  //     timeout: 3000,
  //     error: true,
  //   })
  // }
}
