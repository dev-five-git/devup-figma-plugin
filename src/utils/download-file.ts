/**
 * iframe code to download a file
 * @param fileName
 * @param data
 */
export async function downloadFile(fileName: string, data: string) {
  figma.showUI(downloadFileUi(fileName, data), {
    visible: false,
  })
  return new Promise((resolve) => {
    figma.ui.onmessage = resolve
  })
}
function downloadFileUi(fileName: string, data: string) {
  return `<script>const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([${JSON.stringify(data)}],{type:'text/plain'}));a.download=${JSON.stringify(fileName)};a.click();URL.revokeObjectURL(a.href);window.parent.postMessage({ pluginMessage: undefined }, '*')</script>`
}
