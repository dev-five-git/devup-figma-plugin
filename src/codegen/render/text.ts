import { colorFromFills, propsToPropsWithTypography } from '../../utils'
import { textSegmentToTypography } from '../../utils/text-segment-to-typography'
import { fixTextChild } from '../utils/fix-text-child'
import { renderNode } from '.'

const SEGMENT_TYPE = [
  'fontName',
  'fontWeight',
  'fontSize',
  'textDecoration',
  'textCase',
  'lineHeight',
  'letterSpacing',
  'fills',
  'textStyleId',
  'fillStyleId',
  'listOptions',
  'indentation',
  'hyperlink',
] as (keyof Omit<StyledTextSegment, 'characters' | 'start' | 'end'>)[]
export async function renderText(node: TextNode): Promise<{
  children: string[]
  props: Record<string, string>
}> {
  const segs = node.getStyledTextSegments(SEGMENT_TYPE)

  // select main color
  const propsArray = await Promise.all(
    segs.map(async (seg) =>
      Object.fromEntries(
        Object.entries(
          await propsToPropsWithTypography(
            {
              ...((await textSegmentToTypography(seg)) as any),
              color: await colorFromFills(seg.fills as any),
            },
            seg.textStyleId,
          ),
        )
          .filter(([_, value]) => Boolean(value))
          .map(([key, value]) => [key, String(value)]),
      ),
    ),
  )
  let mainColor = ''
  let mainColorCount = 0
  let mainTypography = ''
  let mainTypographyCount = 0

  propsArray.forEach((props) => {
    const filterdColor = propsArray.filter((p) => p.color === props.color)
    if (filterdColor.length > mainColorCount) {
      mainColor = props.color
      mainColorCount = filterdColor.length
    }

    const filterdTypography = propsArray.filter(
      (p) => p.typography === props.typography,
    )
    if (filterdTypography.length > mainTypographyCount) {
      mainTypography = props.typography
      mainTypographyCount = filterdTypography.length
    }
  })

  const children = await Promise.all(
    segs.map(
      async (
        seg,
        idx,
      ): Promise<{
        children: string[]
        props: Record<string, string>
      }> => {
        const props = propsArray[idx]
        if (segs.length > 1 && mainColor === props.color) delete props.color
        if (segs.length > 1 && mainTypography === props.typography)
          delete props.typography
        let text: string[] = [fixTextChild(seg.characters)]
        let textComponent: 'ul' | 'ol' | null = null

        if (seg.listOptions.type === 'NONE') {
          text = text.map((line) => line.replaceAll('\n', '<br />'))
        } else {
          switch (seg.listOptions.type) {
            case 'UNORDERED': {
              textComponent = 'ul'
              break
            }
            case 'ORDERED': {
              textComponent = 'ol'
              break
            }
          }
          text = text.flatMap((line) =>
            line.split('\n').map((line) => renderNode('li', {}, 0, [line])),
          )
        }
        const resultProps = {
          ...props,
          ...(textComponent
            ? { as: textComponent, my: '0px', pl: '1.5em' }
            : {}),
        }
        if (Object.keys(resultProps).length === 0)
          return { children: text, props: {} }
        return {
          children: text,
          props: resultProps,
        }
      },
    ),
  )
  const resultChildren = children.flat()
  if (resultChildren.length === 1)
    return { children: resultChildren[0].children, props: {} }

  return {
    children: resultChildren.map((child) =>
      renderNode('Text', child.props, 0, child.children),
    ),
    props: {
      color: mainColor,
      typography: mainTypography,
    },
  }
}
