import type { Devup } from '../types'

/**
 * iframe code to upload a file
 * @param fileName
 * @param data
 */
export async function uploadDevupXlsx(): Promise<Devup> {
  figma.showUI(uploadFileUi('.xlsx'))
  return new Promise((resolve) => {
    figma.ui.onmessage = (message) => {
      figma.ui.close()
      resolve(JSON.parse(message))
    }
  })
}
function uploadFileUi(accept: string) {
  return `<script type="text/javascript" src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script><script>function uploadFile(e){let data=e.target.files[0];let reader=new FileReader();reader.readAsDataURL(data);reader.onload=(e)=>{
  const XLSX = globalThis.XLSX;
  const base64 = e.target.result.split(',')[1];
  const workbook = XLSX.read(base64, { type: 'base64' });
  const sheetColors = XLSX.utils.sheet_to_json(workbook.Sheets['Colors']);
  const colors = {}
  if (sheetColors.length > 0) {
    const themeKeys = Object.keys(sheetColors[0])
    for (const themeKey of themeKeys.filter((key) => key !== 'Theme')) {
      colors[themeKey] = {}
      for (const color of sheetColors) {
        colors[themeKey][color.Theme] = color[themeKey]
      }
    }
  }



  const typographySheet = XLSX.utils.sheet_to_json(workbook.Sheets['Typography']);
  const typography = {}
  if (typographySheet.length > 0) {
    for (const typographyData of typographySheet) {
      typography[typographyData.Name] ??= [null, null, null, null, null, null] 
      typography[typographyData.Name][typographyData.Level] = {
        ...typographyData,
        Name: undefined,
        Level: undefined
      }
    }
    for (const [name, value] of Object.entries(typography)) {
      for (let i = value.length-1; i >= 0; i--) {
        if (value[i] === null)
          value.pop()
        else break
      }
      if (value.length === 1) {
        typography[name] = value[0]
      }
    }
  }
  window.parent.postMessage({pluginMessage:JSON.stringify({theme:{colors,typography}})},'*')}}</script><input type="file" onchange="uploadFile(event)" accept="${accept}">`
}
