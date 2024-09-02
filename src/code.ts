import { createDevupColorPalette } from './features/create-devup-color-palette'
import { exportDevupConfig } from './features/export-devup-config'

figma.showUI(__html__)
figma.ui.resize(400, 200)

figma.ui.onmessage = async (msg: { type: string; count: number }) => {
  switch (msg.type) {
    case 'create-palette':
      await createDevupColorPalette()
      figma.closePlugin()
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
