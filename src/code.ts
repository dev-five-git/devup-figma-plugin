import { PAGE_DEVUP_DESIGN_SYSTEM } from './constants/Theme'
import { createDevupColorPalette } from './features/create-devup-color-palette'
import { exportDevupConfig } from './features/export-devup-config'
import { colorObserver } from './observers/theme/color/color-observer'

figma.showUI(__html__)
figma.ui.resize(400, 200)

await figma.loadAllPagesAsync()

figma.on('documentchange', (e) => {
  if (figma.currentPage.name !== PAGE_DEVUP_DESIGN_SYSTEM) return
  e.documentChanges.forEach((change) => {
    switch (change.type) {
      case 'PROPERTY_CHANGE':
        if (change.properties.length === 1 && change.properties[0] === 'fills')
          colorObserver(change.id)
        break
    }
  })
})
figma.ui.onmessage = async (msg: { type: string; count: number }) => {
  switch (msg.type) {
    case 'create-palette':
      await createDevupColorPalette()
      figma.notify('Devup Color Palette created')
      break
    case 'export-devup-config':
      await exportDevupConfig()
      break
    case 'add-palette':
      break
    case 'close':
      figma.closePlugin()
      break
  }
}
