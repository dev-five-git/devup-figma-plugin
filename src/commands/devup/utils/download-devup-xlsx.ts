/**
 * iframe code to download a file
 * @param fileName
 * @param data
 * @param ctx
 */
export async function downloadDevupXlsx(
  fileName: string,
  data: string,
  ctx: typeof figma = figma,
) {
  ctx.showUI(downloadFileUi(), {
    visible: false,
  })

  const pro = new Promise((resolve) => {
    ctx.ui.onmessage = resolve
  })

  ctx.ui.postMessage({
    type: 'download',
    fileName,
    data,
  })

  // The iframe always answers — with an error string when the workbook could
  // not be built. Without that guarantee a throw inside the iframe would leave
  // this promise pending forever and the plugin would never close.
  const error = await pro
  if (typeof error === 'string') {
    ctx.notify(`Failed to export ${fileName}: ${error}`, { error: true })
  }
  return error
}
function downloadFileUi() {
  return `<script type="text/javascript" src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script><script>onmessage=(event)=>{
  let error;
  try {
  const XLSX = globalThis.XLSX;

  const workbook = XLSX.utils.book_new()
  workbook.SheetNames.push("Colors");
  workbook.SheetNames.push("Typography");
  const devup = JSON.parse(event.data.pluginMessage.data);
  const theme = devup.theme || {};

  // A file may legitimately have no color variables or no text styles — the
  // matching sheet is then just its header row, never a crash.
  const themeColors = theme.colors || {};
  const themeKeys = Object.keys(themeColors);
  const colors = [['Theme', ...themeKeys]]
  if (themeKeys.length > 0) {
    const colorKeys = Object.keys(themeColors[themeKeys[0]] || {});
    for (const colorKey of colorKeys) {
      colors.push([colorKey, ...themeKeys.map((themeKey) => themeColors[themeKey][colorKey])])
    }
  }
  workbook.Sheets['Colors'] = XLSX.utils.aoa_to_sheet(colors)

  const themeTypography = theme.typography || {};
  const typography = [['Name', 'Level', 'fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing']]
  for (const typographyKey of Object.keys(themeTypography)) {
    const rawValue = themeTypography[typographyKey];
    const typographyValue = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (let i = 0; i < typographyValue.length; i++) {
      const value = typographyValue[i];
      if (value) {
        typography.push([typographyKey, i, value.fontFamily, value.fontStyle, value.fontWeight, value.fontSize, value.lineHeight, value.letterSpacing])
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
  } catch (e) {
    error = (e && e.message) || String(e)
  } finally {
    window.parent.postMessage({ pluginMessage: error }, '*')
  }
}</script>`
}
