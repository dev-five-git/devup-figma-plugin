import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { extractVariableName } from './extract-variable-name'
import { fmtPct } from './fmtPct'
import { replaceAllVarFunctions } from './replace-all-var-functions'
interface Point {
  x: number
  y: number
}

/**
 * This function converts Figma paint to CSS.
 * The purpose of this function is to natively support all css conversion,
 * hence gradually removing getCSSAsync() dependency.
 * For now, SOLID, and GRADIENT_LINEAR types are implemented.
 */
export default async function paintToCSS(
  fill: Paint,
  node: SceneNode,
): Promise<string | null> {
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
    case 'GRADIENT_ANGULAR':
    case 'GRADIENT_DIAMOND':
    case 'IMAGE':
    case 'PATTERN':
      return await getDefaultCSSBackground(node)
    default:
      return null
  }
}

async function getDefaultCSSBackground(node: SceneNode): Promise<string> {
  const css = await node.getCSSAsync()
  const bg = css.background || css.fill
  const resultBg = replaceAllVarFunctions(bg, extractVariableName)
  return resultBg.replace('<path-to-image>', '/icons/' + node.name + '.png')
}

function convertSolid(fill: SolidPaint): string {
  if (fill.opacity === 0) return 'transparent'
  return optimizeHex(
    rgbaToHex(
      figma.util.rgba({
        ...fill.color,
        a: fill.opacity,
      }),
    ),
  )
}

export function convertGradientLinear(
  gradientData: GradientPaint,
  width: number,
  height: number,
): string {
  // Handle gradient opacity
  if (gradientData.opacity === 0) return 'transparent'

  // 1. Calculate actual start and end points of Figma gradient
  const { start, end } = _calculateActualPositions(
    gradientData.gradientTransform,
    width,
    height,
  )

  // 2. Calculate element center point
  const center = { x: width / 2, y: height / 2 }

  // 3. Calculate gradient angle
  // Figma: right is 0 degrees, increases clockwise
  const figmaAngle = _calculateAngle(start, end)

  // 3.1 Convert Figma angle to CSS angle
  // CSS: up is 0 degrees, increases clockwise
  // Conversion formula: cssAngle = (figmaAngle + 90) % 360
  const cssAngle = Math.round((figmaAngle - 180) % 360)

  // 4. Calculate CSS gradient length
  const gradientLength = _calculateGradientLength(width, height, cssAngle)
  const gradientLengthHalf = gradientLength / 2

  // 5. Calculate CSS gradient start and end points (based on center point)
  const { cssStart, cssEnd } = _calculateCSSStartEnd(
    center,
    cssAngle,
    gradientLengthHalf,
  )

  // 6. Map Figma gradient stops to CSS space
  const stops = _mapGradientStops(
    gradientData.gradientStops,
    start,
    end,
    cssStart,
    cssEnd,
    gradientData.opacity,
  )

  // 7. Generate CSS linear gradient string
  return `linear-gradient(${cssAngle}deg, ${stops
    .map(
      (stop) =>
        `${optimizeHex(rgbaToHex(stop.color))} ${fmtPct(stop.position * 100)}%`,
    )
    .join(', ')})`
}

function _calculateActualPositions(
  gradientTransform: number[][],
  width: number,
  height: number,
) {
  const matrixInverse = _inverseMatrix(gradientTransform)
  // Transform start and end points from gradient space to standard space
  // In gradient space, start and end points are [0, 0.5] [1, 0.5]
  // In standard space, start and end points should be transformed based on 0 degrees
  const normalizedStart = _applyMatrixToPoint(matrixInverse, [0, 0.5])
  const normalizedEnd = _applyMatrixToPoint(matrixInverse, [1, 0.5])

  // Convert start and end points from standard space to pixel units
  // Should be transformed based on 0 degrees in Figma space
  return {
    start: { x: normalizedStart.x * width, y: normalizedStart.y * height },
    end: { x: normalizedEnd.x * width, y: normalizedEnd.y * height },
  }
}

function _calculateAngle(startPoint: Point, endPoint: Point): number {
  const deltaX = endPoint.x - startPoint.x
  const deltaY = endPoint.y - startPoint.y

  // Calculate angle using atan2 function (in radians)
  // atan2 returns values between -π and π
  let angle = Math.atan2(deltaY, deltaX)

  // Convert radians to degrees
  angle = angle * (180 / Math.PI)

  // Convert to Figma's angle system
  angle = (angle - 90) % 360

  // Convert negative angles to positive (e.g., -90 degrees -> 270 degrees)
  return angle < 0 ? angle + 360 : angle
}

function _calculateGradientLength(
  width: number,
  height: number,
  angleDegrees: number,
): number {
  const angleRadians = (angleDegrees * Math.PI) / 180
  // Calculate diagonal length (to ensure gradient fully covers the element)
  return (
    Math.abs(width * Math.sin(angleRadians)) +
    Math.abs(height * Math.cos(angleRadians))
  )
}

function _calculateCSSStartEnd(
  centerPoint: Point,
  cssAngle: number,
  gradientLengthHalf: number,
) {
  // Convert CSS angle to radians (up is 0 degrees, increases clockwise)
  const cssAngleRadians = (cssAngle - 90) * (Math.PI / 180)

  return {
    cssStart: {
      x: centerPoint.x - gradientLengthHalf * Math.cos(cssAngleRadians),
      y: centerPoint.y - gradientLengthHalf * Math.sin(cssAngleRadians),
    },
    cssEnd: {
      x: centerPoint.x + gradientLengthHalf * Math.cos(cssAngleRadians),
      y: centerPoint.y + gradientLengthHalf * Math.sin(cssAngleRadians),
    },
  }
}

function _mapGradientStops(
  stops: readonly ColorStop[],
  figmaStartPoint: Point,
  figmaEndPoint: Point,
  cssStartPoint: Point,
  cssEndPoint: Point,
  opacity: number = 1,
) {
  const figmaVector = {
    x: figmaEndPoint.x - figmaStartPoint.x,
    y: figmaEndPoint.y - figmaStartPoint.y,
  }

  const cssVector = {
    x: cssEndPoint.x - cssStartPoint.x,
    y: cssEndPoint.y - cssStartPoint.y,
  }
  const cssLengthSquared = cssVector.x ** 2 + cssVector.y ** 2

  return stops.map((stop) => {
    // Calculate actual pixel position of stop in Figma space (offset)
    const offsetX = figmaStartPoint.x + figmaVector.x * stop.position
    const offsetY = figmaStartPoint.y + figmaVector.y * stop.position

    // Compute signed relative position along CSS gradient line (can be <0 or >1)
    // t = dot(P - start, (end - start)) / |end - start|^2
    const pointFromStart = {
      x: offsetX - cssStartPoint.x,
      y: offsetY - cssStartPoint.y,
    }
    const dot = pointFromStart.x * cssVector.x + pointFromStart.y * cssVector.y
    const relativePosition = cssLengthSquared === 0 ? 0 : dot / cssLengthSquared

    // Apply gradient opacity to the color stop
    const colorWithOpacity = figma.util.rgba({
      ...stop.color,
      a: stop.color.a * opacity,
    })

    return {
      position: relativePosition,
      color: colorWithOpacity,
    }
  })
}

function _inverseMatrix(matrix: number[][]): number[][] {
  const [a, b, c] = matrix[0]
  const [d, e, f] = matrix[1]
  const determinant = a * e - b * d
  return [
    [e / determinant, -b / determinant, (b * f - c * e) / determinant],
    [-d / determinant, a / determinant, (c * d - a * f) / determinant],
  ]
}

function _applyMatrixToPoint(matrix: number[][], point: number[]): Point {
  return {
    x: matrix[0][0] * point[0] + matrix[0][1] * point[1] + matrix[0][2],
    y: matrix[1][0] * point[0] + matrix[1][1] * point[1] + matrix[1][2],
  }
}
