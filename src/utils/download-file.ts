export async function downloadFile(filename: string, content: string) {
  // const fileData = await figma.exportAsync(figma.currentPage, { format: 'PNG' })
  //
  // // 파일 데이터를 base64 문자열로 변환합니다.
  // const base64Data = figma.base64Encode(fileData)
  //
  // // UI에 메시지를 보내서 파일을 다운로드하게 합니다.

  figma.ui.postMessage({
    type: 'download',
    data: content,
    name: filename,
  })
}
