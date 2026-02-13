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

/**
 * Indentation format tests to prevent regression.
 *
 * Expected indentation pattern:
 * - Function body: 2 spaces
 * - Inside return (): 4 spaces (baseDepth + 1 = 2, so 2 * 2 = 4)
 * - Nested children: +2 spaces per level (6, 8, 10, ...)
 * - Props on multiple lines: +2 spaces from component tag
 */
describe('renderComponent indentation', () => {
  test('single line JSX stays on same line as return', () => {
    const result = renderComponent('Button', '<Button />', {})
    expect(result).toBe(`export function Button() {
  return <Button />
}`)
  })

  test('multiline JSX has 4 spaces inside return ()', () => {
    const code = `<Box>
  <Text />
</Box>`
    const result = renderComponent('Card', code, {})

    // Verify indentation pattern
    const lines = result.split('\n')
    expect(lines[2]).toBe('    <Box>') // 4 spaces
    expect(lines[3]).toBe('      <Text />') // 6 spaces
    expect(lines[4]).toBe('    </Box>') // 4 spaces
  })

  test('deeply nested children increment by 2 spaces each level', () => {
    const code = `<VStack>
  <Flex>
    <Box>
      <Text />
    </Box>
  </Flex>
</VStack>`
    const result = renderComponent('DeepNested', code, {})

    const lines = result.split('\n')
    expect(lines[2]).toBe('    <VStack>') // 4 spaces (level 1)
    expect(lines[3]).toBe('      <Flex>') // 6 spaces (level 2)
    expect(lines[4]).toBe('        <Box>') // 8 spaces (level 3)
    expect(lines[5]).toBe('          <Text />') // 10 spaces (level 4)
    expect(lines[6]).toBe('        </Box>') // 8 spaces
    expect(lines[7]).toBe('      </Flex>') // 6 spaces
    expect(lines[8]).toBe('    </VStack>') // 4 spaces
  })

  test('multiline props are indented correctly', () => {
    // When renderNode produces multiline props (5+ props or complex values)
    const code = `<Center
  bg="red"
  color="white"
  p="10px"
  m="5px"
  w="100%"
>
  <Text />
</Center>`
    const result = renderComponent('MultiProps', code, {})

    const lines = result.split('\n')
    expect(lines[2]).toBe('    <Center') // 4 spaces
    expect(lines[3]).toBe('      bg="red"') // 6 spaces (props)
    expect(lines[9]).toBe('      <Text />') // 6 spaces (child)
    expect(lines[10]).toBe('    </Center>') // 4 spaces
  })

  test('component with variants maintains correct indentation', () => {
    const code = `<Button>
  <Text />
</Button>`
    const result = renderComponent('MyButton', code, {
      variant: '"primary" | "secondary"',
    })

    expect(result).toContain('export interface MyButtonProps')
    const lines = result.split('\n')
    // Line 0-2: interface, Line 3: empty, Line 4-5: function + return, Line 6+: JSX
    expect(lines[6]).toBe('    <Button>') // 4 spaces
    expect(lines[7]).toBe('      <Text />') // 6 spaces
    expect(lines[8]).toBe('    </Button>') // 4 spaces
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

export function Banner({ size }: BannerProps) {
  return (
    <Box>
      <Text />
    </Box>
  )
}`,
    },
    {
      title: 'renders boolean variants as optional in interface',
      component: 'Button',
      code: '<Center />',
      variants: {
        leftIcon: 'boolean',
        size: '"sm" | "lg"',
        rightIcon: 'boolean',
      } as Record<string, string>,
      expected: `export interface ButtonProps {
  leftIcon?: boolean
  size: "sm" | "lg"
  rightIcon?: boolean
}

export function Button({ leftIcon, size, rightIcon }: ButtonProps) {
  return <Center />
}`,
    },
  ])('$title', ({ component, code, variants, expected }) => {
    const result = renderComponent(component, code, variants)
    expect(result).toBe(expected)
  })
})

describe('renderComponent with comments', () => {
  test('prepends JSDoc comment for variant with comment', () => {
    const result = renderComponent(
      'Button',
      '<Center />',
      { children: 'React.ReactNode', size: '"sm" | "lg"' },
      { children: 'label' },
    )
    expect(result).toBe(`export interface ButtonProps {
  /** label */
  children: React.ReactNode
  size: "sm" | "lg"
}

export function Button({ children, size }: ButtonProps) {
  return <Center />
}`)
  })

  test('does not add comment when comments map is empty', () => {
    const result = renderComponent(
      'Button',
      '<Center />',
      { children: 'React.ReactNode' },
      {},
    )
    expect(result).toBe(`export interface ButtonProps {
  children: React.ReactNode
}

export function Button({ children }: ButtonProps) {
  return <Center />
}`)
  })

  test('does not add comment when comments is undefined', () => {
    const result = renderComponent('Button', '<Center />', {
      children: 'React.ReactNode',
    })
    expect(result).toBe(`export interface ButtonProps {
  children: React.ReactNode
}

export function Button({ children }: ButtonProps) {
  return <Center />
}`)
  })
})

describe('renderComponent interface snapshot', () => {
  test('VARIANT + BOOLEAN + INSTANCE_SWAP mixed interface', () => {
    const code = `<Center gap="10px" px="24px">
  {leftIcon}
  <Text fontSize="16px">buttonLg</Text>
  {rightIcon}
</Center>`
    const variants: Record<string, string> = {
      leftIcon: 'React.ReactNode',
      showLeftIcon: 'boolean',
      rightIcon: 'React.ReactNode',
      showRightIcon: 'boolean',
      size: "'lg' | 'md' | 'sm'",
      variant: "'primary' | 'ghost' | 'disabled'",
    }
    const result = renderComponent('Button', code, variants)
    expect(result).toMatchSnapshot()
  })

  test('BOOLEAN-only interface (all optional)', () => {
    const code = `<Flex>
  {showBadge && <Box />}
  {showIcon && <Box />}
</Flex>`
    const variants: Record<string, string> = {
      showBadge: 'boolean',
      showIcon: 'boolean',
    }
    const result = renderComponent('Card', code, variants)
    expect(result).toMatchSnapshot()
  })

  test('INSTANCE_SWAP-only interface (all required)', () => {
    const code = `<Flex>
  {leftIcon}
  <Text>label</Text>
  {rightIcon}
</Flex>`
    const variants: Record<string, string> = {
      leftIcon: 'React.ReactNode',
      rightIcon: 'React.ReactNode',
    }
    const result = renderComponent('IconButton', code, variants)
    expect(result).toMatchSnapshot()
  })
})
