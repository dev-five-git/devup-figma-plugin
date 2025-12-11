import { describe, expect, test } from 'bun:test'
import { renderComponent, renderNode } from '../render'

describe('renderNode', () => {
  test.each([
    {
      title: 'removes component specific defaults for Flex',
      component: 'Flex',
      props: { display: 'flex', gap: '8px' },
      deps: 0,
      children: [] as string[],
      expected: '<Flex gap="8px" />',
    },
    {
      title: 'drops default props and component filtered props',
      component: 'Center',
      props: {
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        display: 'flex',
      },
      deps: 0,
      children: [] as string[],
      expected: '<Center />',
    },
    {
      title: 'indents nested children',
      component: 'Box',
      props: { p: '8px' },
      deps: 1,
      children: ['<Text />'] as string[],
      expected: '  <Box p="8px">\n    <Text />\n  </Box>',
    },
  ])('$title', ({ component, props, deps, children, expected }) => {
    const result = renderNode(component, props, deps, children)
    expect(result).toBe(expected)
  })
})

describe('renderComponent', () => {
  test.each([
    {
      title: 'renders simple component without variants',
      component: 'Button',
      code: '<Button />',
      variants: {} as Record<string, string>,
      expected: `export function Button() {
  return <Button />
 }`,
    },
    {
      title: 'renders component with variants and multiline code',
      component: 'Banner',
      code: `<Box>
  <Text />
</Box>`,
      variants: { size: '"sm" | "lg"' },
      expected: `export interface BannerProps {
  size: "sm" | "lg"
}

export function Banner() {
  return (
<Box>
  <Text />
</Box>
  )
 }`,
    },
  ])('$title', ({ component, code, variants, expected }) => {
    const result = renderComponent(component, code, variants)
    expect(result).toBe(expected)
  })
})
