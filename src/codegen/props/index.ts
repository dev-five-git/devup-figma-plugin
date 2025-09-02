import { getAutoLayoutProps } from './auto-layout'
import { getBackgroundProps } from './background'
import { getBorderRadiusProps } from './border-radius'
import { getLayoutProps, getMinMaxProps } from './layout'
import { getPaddingProps } from './padding'
import { getTextAlignProps } from './text-align'

export async function getProps(
  node: SceneNode,
): Promise<Record<string, boolean | string | number | undefined | null>> {
  return {
    ...getAutoLayoutProps(node),
    ...getMinMaxProps(node),
    ...getLayoutProps(node),
    ...getBorderRadiusProps(node),
    ...(await getBackgroundProps(node)),
    ...getPaddingProps(node),
    ...getTextAlignProps(node),
  }
}

export function filterPropsWithComponent(
  component: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const newProps: Record<string, unknown> = {}
  if (component === 'Image') {
    const w = props.w
    const h = props.h
    if (w && h) {
      newProps.aspectRatio =
        Math.floor(
          ((parseFloat(w as string) as number) /
            (parseFloat(h as string) as number)) *
            100,
        ) / 100
    } else if (props.boxSize) {
      newProps.aspectRatio = '1'
    }
  }
  for (const [key, value] of Object.entries(props)) {
    switch (component) {
      case 'Flex':
      case 'Grid':
        if (['display'].includes(key)) continue
        break
      case 'Center':
        if (['alignItems', 'justifyContent', 'display'].includes(key)) continue
        break
      case 'VStack':
        if (['flexDir', 'display'].includes(key)) continue
        break
      case 'Image':
        if (['w', 'h', 'display', 'alignItems', 'justifyContent'].includes(key))
          continue
        break
    }
    newProps[key] = value
  }
  return newProps
}
