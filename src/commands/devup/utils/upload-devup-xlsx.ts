import type { Devup } from '../types'

/**
 * iframe code to upload a file
 * @param ctx
 */
export async function uploadDevupXlsx(
  ctx: typeof figma = figma,
): Promise<Devup> {
  ctx.showUI(uploadFileUi('.xlsx'))
  return new Promise((resolve) => {
    ctx.ui.onmessage = (message) => {
      ctx.ui.close()
      // The iframe always answers — with an `error` field when the workbook
      // could not be read. Without that guarantee a throw inside the iframe
      // would leave this promise pending forever and the plugin would hang.
      const parsed = JSON.parse(message) as Devup & { error?: string }
      if (parsed.error) {
        ctx.notify(`Failed to import the xlsx file: ${parsed.error}`, {
          error: true,
        })
      }
      resolve({ theme: parsed.theme })
    }
  })
}
function uploadFileUi(accept: string) {
  return `<script type="text/javascript" src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script><script>function uploadFile(e){let data=e.target.files[0];let reader=new FileReader();reader.readAsDataURL(data);reader.onerror=()=>{
  window.parent.postMessage({pluginMessage:JSON.stringify({theme:{colors:{},typography:{}},error:'the file could not be read'})},'*')
};reader.onload=(e)=>{
  let error;
  const colors = {}
  const typography = {}
  try {
  const XLSX = globalThis.XLSX;
  const base64 = e.target.result.split(',')[1];
  const workbook = XLSX.read(base64, { type: 'base64' });
  // A workbook authored elsewhere may not carry both sheets — a missing sheet
  // means "nothing to import", never a crash.
  const colorsSheet = workbook.Sheets['Colors'];
  const sheetColors = colorsSheet ? XLSX.utils.sheet_to_json(colorsSheet) : [];
  if (sheetColors.length > 0) {
    const themeKeys = Object.keys(sheetColors[0])
    for (const themeKey of themeKeys.filter((key) => key !== 'Theme')) {
      colors[themeKey] = {}
      for (const color of sheetColors) {
        colors[themeKey][color.Theme] = color[themeKey]
      }
    }
  }

  const typographySheetRef = workbook.Sheets['Typography'];
  const typographySheet = typographySheetRef ? XLSX.utils.sheet_to_json(typographySheetRef) : [];
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
  } catch (err) {
    error = (err && err.message) || String(err)
  } finally {
    window.parent.postMessage({pluginMessage:JSON.stringify({theme:{colors,typography},error})},'*')
  }
}}</script><input type="file" onchange="uploadFile(event)" accept="${accept}">`
}
