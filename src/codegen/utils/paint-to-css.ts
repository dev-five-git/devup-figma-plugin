import { optimizeHex } from '../../utils/optimize-hex'
import { rgbaToHex } from '../../utils/rgba-to-hex'
import { toCamel } from '../../utils/to-camel'
import { checkAssetNode } from './check-asset-node'
import { fmtPct } from './fmtPct'
import { solidToString, solidToStringSync } from './solid-to-string'
import { getVariableByIdCached } from './variable-cache'
import { buildCssUrl } from './wrap-url'

interface Point {
  x: number
  y: number
}

/**
 * Process a single gradient stop to get its color string with opacity applied
 */
async function processGradientStopColor(
  stop: ColorStop,
  opacity: number,
): Promise<string> {
  if (stop.boundVariables?.color) {
    const variable = await getVariableByIdCached(
      stop.boundVariables.color.id as string,
    )
    if (variable?.name) {
      const tokenName = `$${toCamel(variable.name)}`
      const finalAlpha = stop.color.a * opacity

      if (finalAlpha < 1) {
        const transparentPercent = fmtPct((1 - finalAlpha) * 100)
        return `color-mix(in srgb, ${tokenName}, transparent ${transparentPercent}%)`
      }
      return tokenName
    }
  }

  const colorWithOpacity = figma.util.rgba({
    ...stop.color,
    a: stop.color.a * opacity,
  })
  return optimizeHex(rgbaToHex(colorWithOpacity))
}

/**
 * Synchronous fast path for processGradientStopColor.
 * Returns null when the stop has a variable-bound color (caller must use async).
 */
function processGradientStopColorSync(
  stop: ColorStop,
  opacity: number,
): string | null {
  if (stop.boundVariables?.color) return null

  const colorWithOpacity = figma.util.rgba({
    ...stop.color,
    a: stop.color.a * opacity,
  })
  return optimizeHex(rgbaToHex(colorWithOpacity))
}

/**
 * Map gradient stops to CSS color strings with positions
 */
async function mapSimpleGradientStops(
  stops: readonly ColorStop[],
  opacity: number,
  positionMultiplier: number = 100,
): Promise<string> {
  // Sync fast path: try to resolve all stops without async
  const syncResults: string[] = []
  let allSync = true
  for (const stop of stops) {
    const color = processGradientStopColorSync(stop, opacity)
    if (color === null) {
      allSync = false
      break
    }
    syncResults.push(`${color} ${fmtPct(stop.position * positionMultiplier)}%`)
  }
  if (allSync) return syncResults.join(', ')

  // Async fallback for variable-bound colors
  const stopsArray = await Promise.all(
    stops.map(async (stop) => {
      const colorString = await processGradientStopColor(stop, opacity)
      return `${colorString} ${fmtPct(stop.position * positionMultiplier)}%`
    }),
  )
  return stopsArray.join(', ')
}

/**
 * This function converts Figma paint to CSS.
 */
export async function paintToCSS(
  fill: Paint,
  node: SceneNode,
  last: boolean,
): Promise<string | null> {
  switch (fill.type) {
    case 'SOLID':
      return last
        ? await solidToString(fill)
        : await convertSolidLinearGradient(fill)
    case 'GRADIENT_LINEAR':
      return await convertGradientLinear(fill, node.width, node.height)
    case 'GRADIENT_RADIAL':
      return await convertRadial(fill, node.width, node.height)
    case 'GRADIENT_ANGULAR':
      return await convertAngular(fill, node.width, node.height)
    case 'GRADIENT_DIAMOND':
      return await convertDiamond(fill, node.width, node.height)
    case 'IMAGE':
      return convertImage(fill)
    case 'PATTERN':
      return await convertPattern(fill)
    default:
      return null
  }
}

/**
 * Synchronous fast path for paintToCSS.
 * Returns the CSS string immediately for SOLID (non-variable) and IMAGE fills.
 * Returns undefined to signal "not handled synchronously — caller must use async paintToCSS".
 */
export function paintToCSSSyncIfPossible(
  fill: Paint,
  _node: SceneNode,
  last: boolean,
): string | null | undefined {
  switch (fill.type) {
    case 'SOLID': {
      if (last) {
        return solidToStringSync(fill) ?? undefined
      }
      // Non-last solid needs linear-gradient wrapper — check sync path
      if (fill.opacity === 0) return 'transparent'
      const color = solidToStringSync(fill)
      if (color === null) return undefined // variable-bound, need async
      return `linear-gradient(${color}, ${color})`
    }
    case 'IMAGE':
      return convertImage(fill)
    default:
      // Gradients and patterns need async
      return undefined
  }
}

function convertImage(fill: ImagePaint): string {
  if (!fill.visible) return 'transparent'
  if (fill.opacity === 0) return 'transparent'

  // Get image filename from hash or use default
  const imageName = 'image.png'

  switch (fill.scaleMode) {
    case 'FILL':
      return `${buildCssUrl(`/icons/${imageName}`)} center/cover no-repeat`
    case 'FIT':
      return `${buildCssUrl(`/icons/${imageName}`)} center/contain no-repeat`
    case 'CROP':
      return `${buildCssUrl(`/icons/${imageName}`)} center/cover no-repeat`
    case 'TILE':
      return `${buildCssUrl(`/icons/${imageName}`)} repeat`
  }
}

async function convertDiamond(
  fill: GradientPaint,
  _width: number,
  _height: number,
): Promise<string> {
  if (!fill.visible) return 'transparent'
  if (fill.opacity === 0) return 'transparent'

  const stops = await mapSimpleGradientStops(
    fill.gradientStops,
    fill.opacity ?? 1,
    50,
  )

  const gradients = [
    `linear-gradient(to bottom right, ${stops}) bottom right / 50.1% 50.1% no-repeat`,
    `linear-gradient(to bottom left, ${stops}) bottom left / 50.1% 50.1% no-repeat`,
    `linear-gradient(to top left, ${stops}) top left / 50.1% 50.1% no-repeat`,
    `linear-gradient(to top right, ${stops}) top right / 50.1% 50.1% no-repeat`,
  ]

  return gradients.join(', ')
}

async function convertAngular(
  fill: GradientPaint,
  width: number,
  height: number,
): Promise<string> {
  if (!fill.visible) return 'transparent'
  if (fill.opacity === 0) return 'transparent'

  const { center, startAngle } = _calculateAngularPositions(
    fill.gradientTransform,
    width,
    height,
  )

  const centerX = fmtPct((center.x / width) * 100)
  const centerY = fmtPct((center.y / height) * 100)

  const stops = await mapSimpleGradientStops(
    fill.gradientStops,
    fill.opacity ?? 1,
  )

  return `conic-gradient(from ${fmtPct(startAngle)}deg at ${centerX}% ${centerY}%, ${stops})`
}

async function convertRadial(
  fill: GradientPaint,
  width: number,
  height: number,
): Promise<string> {
  if (!fill.visible) return 'transparent'
  if (fill.opacity === 0) return 'transparent'

  const { center, radiusW, radiusH } = _calculateRadialPositions(
    fill.gradientTransform,
    width,
    height,
  )

  const centerX = fmtPct((center.x / width) * 100)
  const centerY = fmtPct((center.y / height) * 100)
  const radiusPercentW = fmtPct((radiusW / width) * 100)
  const radiusPercentH = fmtPct((radiusH / height) * 100)

  const stops = await mapSimpleGradientStops(
    fill.gradientStops,
    fill.opacity ?? 1,
  )

  return `radial-gradient(${radiusPercentW}% ${radiusPercentH}% at ${centerX}% ${centerY}%, ${stops})`
}

async function convertPattern(fill: PatternPaint): Promise<string> {
  const node = await figma.getNodeByIdAsync(fill.sourceNodeId)
  const imageExtension = node ? checkAssetNode(node as SceneNode) : null
  const imageName = node?.name ?? 'pattern'
  const horizontalPosition = convertPosition(
    fill.horizontalAlignment,
    fill.spacing.x,
    {
      START: 'left',
      CENTER: 'center',
      END: 'right',
    },
  )
  const verticalPosition = convertPosition(
    'verticalAlignment' in fill
      ? (
          fill as PatternPaint & {
            verticalAlignment: 'START' | 'CENTER' | 'END'
          }
        ).verticalAlignment
      : 'START',
    fill.spacing.y,
    {
      START: 'top',
      CENTER: 'center',
      END: 'bottom',
    },
  )
  const position = [horizontalPosition, verticalPosition]
    .filter(Boolean)
    .join(' ')
  const url = buildCssUrl(`/icons/${imageName}.${imageExtension}`)
  return `${url}${position ? ` ${position}` : ''} repeat`
}

function convertPosition(
  horizontalAlignment: 'START' | 'CENTER' | 'END',
  spacing: number,
  alignmentMap: Record<'START' | 'CENTER' | 'END', string>,
): string | null {
  if (spacing === 0 && horizontalAlignment === 'START') {
    return null
  }
  return `${alignmentMap[horizontalAlignment]} ${fmtPct(spacing * 100)}%`
}

async function convertSolidLinearGradient(fill: SolidPaint): Promise<string> {
  if (fill.opacity === 0) return 'transparent'
  const color = await solidToString(fill)
  return `linear-gradient(${color}, ${color})`
}

async function convertGradientLinear(
  gradientData: GradientPaint,
  width: number,
  height: number,
): Promise<string | null> {
  // Handle opacity & visibility:
  if (!gradientData.visible) return null
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
  const stops = await _mapGradientStops(
    gradientData.gradientStops,
    start,
    end,
    cssStart,
    cssEnd,
    gradientData.opacity,
  )

  // 7. Generate CSS linear gradient string
  return `linear-gradient(${cssAngle}deg, ${stops
    .map((stop) => `${stop.colorString} ${fmtPct(stop.position * 100)}%`)
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

async function _mapGradientStops(
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

  const mapStop = (stop: ColorStop, colorString: string) => {
    const offsetX = figmaStartPoint.x + figmaVector.x * stop.position
    const offsetY = figmaStartPoint.y + figmaVector.y * stop.position

    const pointFromStart = {
      x: offsetX - cssStartPoint.x,
      y: offsetY - cssStartPoint.y,
    }
    const dot = pointFromStart.x * cssVector.x + pointFromStart.y * cssVector.y
    const relativePosition = cssLengthSquared === 0 ? 0 : dot / cssLengthSquared

    return {
      position: relativePosition,
      colorString,
      hasToken: !!stop.boundVariables?.color,
    }
  }

  // Sync fast path: try to resolve all stop colors without async
  const syncResults: string[] = []
  let allSync = true
  for (const stop of stops) {
    const color = processGradientStopColorSync(stop, opacity)
    if (color === null) {
      allSync = false
      break
    }
    syncResults.push(color)
  }
  if (allSync) {
    return stops.map((stop, i) => mapStop(stop, syncResults[i]))
  }

  // Async fallback for variable-bound colors
  return Promise.all(
    stops.map(async (stop) => {
      const colorString = await processGradientStopColor(stop, opacity)
      return mapStop(stop, colorString)
    }),
  )
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

function _calculateRadialPositions(
  gradientTransform: number[][],
  width: number,
  height: number,
) {
  const matrixInverse = _inverseMatrix(gradientTransform)

  // In radial gradient space, center is at [0.5, 0.5] and radius extends to [1, 0.5]
  const normalizedCenter = _applyMatrixToPoint(matrixInverse, [0.5, 0.5])
  const normalizedRadius = _applyMatrixToPoint(matrixInverse, [1, 1])

  // Convert to pixel coordinates
  const center = {
    x: normalizedCenter.x * width,
    y: normalizedCenter.y * height,
  }

  // Calculate radius point in pixel coordinates
  const radiusPoint = {
    x: normalizedRadius.x * width,
    y: normalizedRadius.y * height,
  }

  // Calculate radius as distance from center to the radius point (for backward compatibility)
  const radius = Math.sqrt(
    (radiusPoint.x - center.x) ** 2 + (radiusPoint.y - center.y) ** 2,
  )

  // Calculate separate radius for width and height in normalized space
  // The difference in normalized space represents the actual radius ratio
  const normalizedRadiusW = Math.abs(normalizedRadius.x - normalizedCenter.x)
  const normalizedRadiusH = Math.abs(normalizedRadius.y - normalizedCenter.y)

  // Convert normalized radius to pixel coordinates
  const radiusW = normalizedRadiusW * width
  const radiusH = normalizedRadiusH * height

  return { center, radius, radiusW, radiusH }
}

function _calculateAngularPositions(
  gradientTransform: number[][],
  width: number,
  height: number,
) {
  const matrixInverse = _inverseMatrix(gradientTransform)

  // In angular gradient space, center is at [0.5, 0.5]
  const normalizedCenter = _applyMatrixToPoint(matrixInverse, [0.5, 0.5])

  // Calculate start angle by finding the direction from center to the start point
  // In angular gradient space, start point is at [1, 0.5] (right side)
  const normalizedStart = _applyMatrixToPoint(matrixInverse, [1, 0.5])

  // Convert to pixel coordinates
  const center = {
    x: normalizedCenter.x * width,
    y: normalizedCenter.y * height,
  }

  const startPoint = {
    x: normalizedStart.x * width,
    y: normalizedStart.y * height,
  }

  // Calculate angle from center to start point
  const deltaX = startPoint.x - center.x
  const deltaY = startPoint.y - center.y
  let startAngle = Math.atan2(deltaY, deltaX) * (180 / Math.PI)

  // Convert to CSS angle (CSS starts from top, increases clockwise)
  // Figma starts from right, increases clockwise
  startAngle = (startAngle + 90) % 360
  if (startAngle < 0) startAngle += 360

  return { center, startAngle }
}
