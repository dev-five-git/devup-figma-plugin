import { getAutoLayoutProps } from './auto-layout'
import { getBackgroundProps } from './background'
import { getBorderProps, getBorderRadiusProps } from './border'
import { getEffectProps } from './effect'
import { getEllipsisProps } from './ellipsis'
import { getGridChildProps } from './grid-child'
import { getLayoutProps, getMinMaxProps } from './layout'
import { getMaxLineProps } from './max-line'
import { getObjectFitProps } from './object-fit'
import { getOpacityProps } from './opacity'
import { getPaddingProps } from './padding'
import { getPositionProps } from './position'
import { getTextAlignProps } from './text-align'

export async function getProps(
  node: SceneNode,
): Promise<Record<string, boolean | string | number | undefined | null>> {
  return {
    ...getAutoLayoutProps(node),
    ...getMinMaxProps(node),
    ...getLayoutProps(node),
    ...getBorderRadiusProps(node),
    ...(await getBorderProps(node)),
    ...(await getBackgroundProps(node)),
    ...getOpacityProps(node),
    ...getPaddingProps(node),
    ...getTextAlignProps(node),
    ...getObjectFitProps(node),
    ...getMaxLineProps(node),
    ...getEllipsisProps(node),
    ...(await getEffectProps(node)),
    ...getPositionProps(node),
    ...getGridChildProps(node),
  }
}

export function filterPropsWithComponent(
  component: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const newProps: Record<string, unknown> = {}
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
        if (
          [
            'display',
            'alignItems',
            'justifyContent',
            'flexDir',
            'gap',
          ].includes(key)
        )
          continue
        break
    }
    newProps[key] = value
  }
  return newProps
}
