import { propsToPropsWithTypography } from '../../utils'
import { textSegmentToTypography } from '../../utils/text-segment-to-typography'
import { fixTextChild } from '../utils/fix-text-child'
import { paintToCSS } from '../utils/paint-to-css'
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
              ...(await textSegmentToTypography(seg)),
              color: (
                await Promise.all(
                  seg.fills.map(
                    async (fill, idx) =>
                      await paintToCSS(
                        fill,
                        node,
                        idx === seg.fills.length - 1,
                      ),
                  ),
                )
              ).join(','),
              characters: seg.characters,
            },
            seg.textStyleId,
          ),
        )
          .filter(([_, value]) => Boolean(value))
          .map(([key, value]) => [key, String(value)]),
      ),
    ),
  )
  let defaultTypographyCount = 0
  let defaultProps: Record<string, string> = {}

  propsArray.forEach((props) => {
    if (props.characters.length >= defaultTypographyCount) {
      defaultProps = { ...props }
      delete defaultProps.characters
      defaultTypographyCount = props.characters.length
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
        if (segs.length > 1) {
          for (const key in defaultProps) {
            if (defaultProps[key as keyof typeof defaultProps] === props[key])
              delete props[key]
          }
        }
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
        const resultProps: Record<string, string> = {
          ...props,
          ...(textComponent
            ? { as: textComponent, my: '0px', pl: '1.5em' }
            : {}),
        }
        delete resultProps.characters
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
    return {
      children: resultChildren[0].children,
      props: {
        ...defaultProps,
        ...resultChildren[0].props,
      },
    }

  return {
    children: resultChildren.map((child) => {
      if (Object.keys(child.props).length === 0)
        return child.children.join('<br />')
      return renderNode('Text', child.props, 0, child.children)
    }),
    props: defaultProps,
  }
}
