/**
 * iframe code to upload a file
 * @param fileName
 * @param data
 */
export async function uploadFile(accept: string): Promise<string> {
  figma.showUI(uploadFileUi(accept))
  return new Promise((resolve) => {
    figma.ui.onmessage = (message) => {
      figma.ui.close()
      resolve(String.fromCharCode(...figma.base64Decode(message)))
    }
  })
}
function uploadFileUi(accept: string) {
  return `<script>function uploadFile(e){let data=e.target.files[0];let reader=new FileReader();reader.readAsDataURL(data);reader.onload=(e)=>{const base64 = e.target.result.split(',')[1];window.parent.postMessage({pluginMessage:base64},'*')}}</script><input type="file" onchange="uploadFile(event)" accept="${accept}">`
}
