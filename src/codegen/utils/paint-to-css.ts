import { extractVariableName } from './extract-variable-name'
import { replaceAllVarFunctions } from './replace-all-var-functions'

interface Point {
  x: number
  y: number
}

/**
 * This function converts Figma paint to CSS.
 * The purpose of this function is to natively support all css conversion, hence
 * gradually removing getCSSAsync() dependency.
 *
 * For now, SOLID, and GRADIENT_LINEAR are implemented. Other types should be implemented gradually.
 */
export async function paintToCSS(
  fill: Paint,
  node: SceneNode,
): Promise<string> {
  switch (fill.type) {
    case 'SOLID':
      return convertSolid(fill)
    case 'GRADIENT_LINEAR':
      return convertGradientLinear(
        fill as GradientPaint,
        node.width,
        node.height,
      )
    case 'GRADIENT_RADIAL':
      return convertGradientRadial(fill, node)
    case 'GRADIENT_ANGULAR':
      return convertGradientAngular(fill, node)
    case 'GRADIENT_DIAMOND':
      return convertGradientDiamond(fill, node)
    case 'IMAGE':
      return await convertImage(fill, node)
    case 'PATTERN':
      return await convertPattern(fill, node)
    case 'VIDEO':
      return await convertVideo(fill, node)
  }
}

function convertGradientRadial(fill: GradientPaint, node: SceneNode): string {
  return ''
}

function convertGradientAngular(fill: GradientPaint, node: SceneNode): string {
  return ''
}

function convertGradientDiamond(fill: GradientPaint, node: SceneNode): string {
  return ''
}

function convertImage(fill: ImagePaint, node: SceneNode): string {
  return ''
}

function convertPattern(fill: PatternPaint, node: SceneNode): string {
  return ''
}

function convertVideo(fill: VideoPaint, node: SceneNode): string {
  return ''
}

/**
 * @param node SceneNode
 * @returns PaintToCSSResponseType
 */
const getDefaultCSS = async (node: SceneNode) => {
  const css = await node.getCSSAsync()
  const bg = css.background || css.fill

  if (!bg) {
    return undefined
  }

  const resultBg = replaceAllVarFunctions(bg, extractVariableName)
  const gradientText =
    node.type === 'TEXT' &&
    (node.fills as Paint[]).find(
      (fill) => fill.type === 'IMAGE' || fill.type.includes('GRADIENT'),
    )

  return {
    bg: resultBg.replace('<path-to-image>', '/icons/' + node.name + '.png'),
    color: gradientText ? 'transparent' : undefined,
    bgClip: gradientText ? 'text' : undefined,
  }
}

function convertSolid(fill: SolidPaint): string {
  return `${fill.color}`
}
