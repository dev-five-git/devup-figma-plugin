/**
 * iframe code to download a file
 * @param fileName
 * @param data
 */
export async function downloadFile(
  fileName: string,
  data: string | Uint8Array,
) {
  figma.showUI(downloadFileUi(), {
    visible: false,
  })

  const pro = new Promise((resolve) => {
    figma.ui.onmessage = resolve
  })

  figma.ui.postMessage({
    type: 'download',
    fileName,
    data,
  })

  return pro
}
function downloadFileUi() {
  return `<script>onmessage=(event)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([event.data.pluginMessage.data]));a.download=event.data.pluginMessage.fileName;a.click();URL.revokeObjectURL(a.href);window.parent.postMessage({ pluginMessage: undefined }, '*')}</script>`
}
