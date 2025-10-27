/**
 * iframe code to download a file
 * @param fileName
 * @param data
 */
export async function downloadDevupXlsx(fileName: string, data: string) {
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
  return `<script type="text/javascript" src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script><script>onmessage=(event)=>{
  const XLSX = globalThis.XLSX;

  const workbook = XLSX.utils.book_new()
  workbook.SheetNames.push("Colors");
  workbook.SheetNames.push("Typography");
  const devup = JSON.parse(event.data.pluginMessage.data);

  const themeKeys = Object.keys(devup.theme.colors);
  const colors = [['Theme', ...themeKeys]]
  if (themeKeys.length > 0) {
    const colorKeys = Object.keys(devup.theme.colors[themeKeys[0]]);
    for (const colorKey of colorKeys) {
      colors.push([colorKey, ...themeKeys.map((themeKey) => devup.theme.colors[themeKey][colorKey])])
    }
  }
  workbook.Sheets['Colors'] = XLSX.utils.aoa_to_sheet(colors)

  console.log("devup.theme.typography", JSON.stringify(devup.theme.typography))
  const typographyKeys = Object.keys(devup.theme.typography);
  const typography = [['Name', 'Level', 'fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing']]
  if (typographyKeys.length > 0) {
    for (const typographyKey of typographyKeys) {
      const typographyValue = Array.isArray(devup.theme.typography[typographyKey]) ? devup.theme.typography[typographyKey] : [devup.theme.typography[typographyKey]];
      console.log("typographyValue", typographyValue)
      for (let i = 0; i < typographyValue.length; i++) {
        const value = typographyValue[i];
        if (value) {
          console.log("value", value)
          typography.push([typographyKey, i, value.fontFamily, value.fontStyle, value.fontWeight, value.fontSize, value.lineHeight, value.letterSpacing])
        }
      }
    }
  }
  workbook.Sheets['Typography'] = XLSX.utils.aoa_to_sheet(typography)

  const buffer = XLSX.writeXLSX(workbook, { bookType: 'xlsx', type: 'buffer' })
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = event.data.pluginMessage.fileName
  a.click()
  URL.revokeObjectURL(a.href)
  window.parent.postMessage({ pluginMessage: undefined }, '*')
}</script>`
}
