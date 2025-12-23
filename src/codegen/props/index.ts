import { getAutoLayoutProps } from './auto-layout'
import { getBackgroundProps } from './background'
import { getBlendProps } from './blend'
import { getBorderProps, getBorderRadiusProps } from './border'
import { getCursorProps } from './cursor'
import { getEffectProps } from './effect'
import { getEllipsisProps } from './ellipsis'
import { getGridChildProps } from './grid-child'
import { getLayoutProps, getMinMaxProps } from './layout'
import { getMaxLineProps } from './max-line'
import { getObjectFitProps } from './object-fit'
import { getOverflowProps } from './overflow'
import { getPaddingProps } from './padding'
import { getPositionProps } from './position'
import { getReactionProps } from './reaction'
import { getTextAlignProps } from './text-align'
import { getTextShadowProps } from './text-shadow'
import { getTextStrokeProps } from './text-stroke'
import { getTransformProps } from './transform'
import { getVisibilityProps } from './visibility'

export async function getProps(
  node: SceneNode,
): Promise<Record<string, unknown>> {
  console.log('getProps', getLayoutProps(node))
  return {
    ...getAutoLayoutProps(node),
    ...getMinMaxProps(node),
    ...getLayoutProps(node),
    ...getBorderRadiusProps(node),
    ...(await getBorderProps(node)),
    ...(await getBackgroundProps(node)),
    ...getBlendProps(node),
    ...getPaddingProps(node),
    ...getTextAlignProps(node),
    ...getObjectFitProps(node),
    ...getMaxLineProps(node),
    ...getEllipsisProps(node),
    ...(await getEffectProps(node)),
    ...getPositionProps(node),
    ...getGridChildProps(node),
    ...getTransformProps(node),
    ...getOverflowProps(node),
    ...(await getTextStrokeProps(node)),
    ...(await getTextShadowProps(node)),
    ...(await getReactionProps(node)),
    ...getCursorProps(node),
    ...getVisibilityProps(node),
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
        // Only skip display/flexDir if it's exactly the default value (not responsive array)
        if (key === 'display' && value === 'flex') continue
        if (key === 'flexDir' && value === 'row') continue
        break
      case 'Grid':
        // Only skip display if it's exactly 'grid' (not responsive array or other value)
        if (key === 'display' && value === 'grid') continue
        break
      case 'Center':
        if (['alignItems', 'justifyContent'].includes(key)) continue
        if (key === 'display' && value === 'flex') continue
        if (key === 'flexDir' && value === 'row') continue
        break
      case 'VStack':
        // Only skip flexDir if it's exactly 'column' (not responsive array or other value)
        if (key === 'flexDir' && value === 'column') continue
        if (key === 'display' && value === 'flex') continue
        break

      case 'Image':
      case 'Box':
        if (component === 'Box' && !('maskImage' in props)) break
        if (
          [
            'alignItems',
            'justifyContent',
            'flexDir',
            'gap',
            'outline',
            'outlineOffset',
            'overflow',
          ].includes(key)
        )
          continue
        if (key === 'display' && value === 'flex') continue
        if (!('maskImage' in props) && ['bg'].includes(key)) continue
        break
    }
    newProps[key] = value
  }
  return newProps
}
