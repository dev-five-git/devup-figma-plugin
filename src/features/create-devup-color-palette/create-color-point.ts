import { colorToRgb } from '../../utils/colorToRgb'

export async function createColorPoint(
  name: string,
  variable: Variable | string,
) {
  const res = figma.createEllipse()
  res.name = name
  // set fill
  if (typeof variable === 'string') {
    res.fills = [
      {
        type: 'SOLID',
        color: colorToRgb(variable),
      },
    ]
  } else
    res.fills = [
      figma.variables.setBoundVariableForPaint(
        {
          type: 'SOLID',
          color: {
            r: 0,
            g: 0,
            b: 0,
          },
        },
        'color',
        variable,
      ),
    ]
  res.resize(24, 24)
  return res
}
