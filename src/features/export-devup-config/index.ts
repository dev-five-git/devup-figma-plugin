import { downloadFile } from '../../utils/download-file'
import { loadDevupColor } from './load-devup-color'

export async function exportDevupConfig() {
  const { light, dark } = (await loadDevupColor()) ?? {
    light: {},
    dark: {},
  }
  await downloadFile(
    'devup.json',
    JSON.stringify({
      theme: {
        default: {
          colors: light,
        },
        dark: {
          colors: dark,
        },
      },
    }),
  )
}
