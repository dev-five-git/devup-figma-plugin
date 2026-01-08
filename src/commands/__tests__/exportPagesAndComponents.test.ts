import { describe, expect, test } from 'bun:test'
import {
  DEVUP_COMPONENTS,
  extractCustomComponentImports,
  extractImports,
  generateImportStatements,
} from '../exportPagesAndComponents'

describe('DEVUP_COMPONENTS', () => {
  test('should contain expected devup-ui components', () => {
    expect(DEVUP_COMPONENTS).toContain('Box')
    expect(DEVUP_COMPONENTS).toContain('Flex')
    expect(DEVUP_COMPONENTS).toContain('Text')
    expect(DEVUP_COMPONENTS).toContain('Image')
    expect(DEVUP_COMPONENTS).toContain('Grid')
    expect(DEVUP_COMPONENTS).toContain('VStack')
    expect(DEVUP_COMPONENTS).toContain('Center')
  })
})

describe('extractImports', () => {
  test('should extract Box import', () => {
    const result = extractImports([['Test', '<Box>Hello</Box>']])
    expect(result).toContain('Box')
  })

  test('should extract multiple devup-ui components', () => {
    const result = extractImports([
      ['Test', '<Box><Flex><Text>Hello</Text></Flex></Box>'],
    ])
    expect(result).toContain('Box')
    expect(result).toContain('Flex')
    expect(result).toContain('Text')
  })

  test('should extract keyframes with parenthesis', () => {
    const result = extractImports([
      ['Test', '<Box animationName={keyframes({ "0%": { opacity: 0 } })} />'],
    ])
    expect(result).toContain('keyframes')
    expect(result).toContain('Box')
  })

  test('should extract keyframes with template literal', () => {
    const result = extractImports([
      ['Test', '<Box animationName={keyframes`from { opacity: 0 }`} />'],
    ])
    expect(result).toContain('keyframes')
  })

  test('should not extract keyframes when not present', () => {
    const result = extractImports([['Test', '<Box w="100px" />']])
    expect(result).not.toContain('keyframes')
  })

  test('should return sorted imports', () => {
    const result = extractImports([
      ['Test', '<VStack><Box><Center /></Box></VStack>'],
    ])
    expect(result).toEqual(['Box', 'Center', 'VStack'])
  })

  test('should not include duplicates', () => {
    const result = extractImports([
      ['Test1', '<Box>A</Box>'],
      ['Test2', '<Box>B</Box>'],
    ])
    expect(result.filter((x) => x === 'Box').length).toBe(1)
  })

  test('should handle self-closing tags', () => {
    const result = extractImports([['Test', '<Image />']])
    expect(result).toContain('Image')
  })

  test('should handle tags with spaces', () => {
    const result = extractImports([['Test', '<Grid  rows={2}>']])
    expect(result).toContain('Grid')
  })
})

describe('extractCustomComponentImports', () => {
  test('should extract custom component', () => {
    const result = extractCustomComponentImports([
      ['Test', '<Box><CustomButton /></Box>'],
    ])
    expect(result).toContain('CustomButton')
  })

  test('should extract multiple custom components', () => {
    const result = extractCustomComponentImports([
      ['Test', '<CustomA><CustomB /><CustomC /></CustomA>'],
    ])
    expect(result).toContain('CustomA')
    expect(result).toContain('CustomB')
    expect(result).toContain('CustomC')
  })

  test('should not include devup-ui components', () => {
    const result = extractCustomComponentImports([
      ['Test', '<Box><Flex><CustomCard /></Flex></Box>'],
    ])
    expect(result).toContain('CustomCard')
    expect(result).not.toContain('Box')
    expect(result).not.toContain('Flex')
  })

  test('should return sorted imports', () => {
    const result = extractCustomComponentImports([
      ['Test', '<Zebra /><Apple /><Mango />'],
    ])
    expect(result).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  test('should not include duplicates', () => {
    const result = extractCustomComponentImports([
      ['Test1', '<SharedButton />'],
      ['Test2', '<SharedButton />'],
    ])
    expect(result.filter((x) => x === 'SharedButton').length).toBe(1)
  })

  test('should return empty array when no custom components', () => {
    const result = extractCustomComponentImports([
      ['Test', '<Box><Flex>Hello</Flex></Box>'],
    ])
    expect(result).toEqual([])
  })
})

describe('generateImportStatements', () => {
  test('should generate devup-ui import statement', () => {
    const result = generateImportStatements([['Test', '<Box><Flex /></Box>']])
    expect(result).toContain("import { Box, Flex } from '@devup-ui/react'")
  })

  test('should generate custom component import statements', () => {
    const result = generateImportStatements([
      ['Test', '<Box><CustomButton /></Box>'],
    ])
    expect(result).toContain("import { Box } from '@devup-ui/react'")
    expect(result).toContain(
      "import { CustomButton } from '@/components/CustomButton'",
    )
  })

  test('should generate multiple custom component imports on separate lines', () => {
    const result = generateImportStatements([
      ['Test', '<Box><ButtonA /><ButtonB /></Box>'],
    ])
    expect(result).toContain("import { ButtonA } from '@/components/ButtonA'")
    expect(result).toContain("import { ButtonB } from '@/components/ButtonB'")
  })

  test('should return empty string when no imports', () => {
    const result = generateImportStatements([['Test', 'just text']])
    expect(result).toBe('')
  })

  test('should include keyframes in devup-ui import', () => {
    const result = generateImportStatements([
      ['Test', '<Box animation={keyframes({})} />'],
    ])
    expect(result).toContain('keyframes')
    expect(result).toContain("from '@devup-ui/react'")
  })

  test('should end with double newline when has imports', () => {
    const result = generateImportStatements([['Test', '<Box />']])
    expect(result.endsWith('\n\n')).toBe(true)
  })
})
