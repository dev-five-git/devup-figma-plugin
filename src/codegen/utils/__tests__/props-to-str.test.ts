import { describe, expect, test } from 'bun:test'
import { createVariantPropValue } from '../../responsive'
import { propsToString } from '../props-to-str'

describe('propsToString', () => {
  test('sorts uppercase keys first and formats booleans/strings', () => {
    const res = propsToString({ Z: '1', a: '2', b: false })
    expect(res.split(' ')).toContain('Z="1"')
    expect(res.split(' ')).toContain('b={false}')
  })

  test('omits assignment for boolean true', () => {
    const res = propsToString({ Active: true, label: 'ok' })
    expect(res).toContain('Active')
    expect(res).not.toContain('Active={true}')
  })

  test('sort comparator handles lower then upper keys', () => {
    const res = propsToString({ b: '1', A: '2' })
    expect(res.startsWith('A="2"')).toBe(true)
  })

  test('formats objects with newlines when many props', () => {
    const res = propsToString({
      a: '1',
      b: { x: 1 },
      c: '3',
      d: '4',
      e: '5',
    })
    expect(res).toContain('\n')
    expect(res).toContain(`b={${JSON.stringify({ x: 1 }, null, 2)}}`)
  })

  test('handles empty props', () => {
    expect(propsToString({})).toBe('')
  })

  test('handles animationName with keyframes function', () => {
    const res = propsToString({
      animationName: 'keyframes({"0%":{"opacity":0},"100%":{"opacity":1}})',
    })
    expect(res).toContain('animationName={keyframes(')
    expect(res).toContain('"0%"')
    expect(res).toContain('"100%"')
  })

  test('handles animationName with invalid keyframes JSON', () => {
    const res = propsToString({
      animationName: 'keyframes(invalid-json)',
    })
    expect(res).toBe('animationName={keyframes(invalid-json)}')
  })

  test('handles animationName starting with keyframes but no parentheses match', () => {
    const res = propsToString({
      animationName: 'keyframes(',
    })
    expect(res).toBe('animationName={keyframes(}')
  })

  test('handles animationName without keyframes prefix', () => {
    const res = propsToString({
      animationName: 'fadeIn',
    })
    expect(res).toBe('animationName="fadeIn"')
  })

  test('handles object values', () => {
    const res = propsToString({
      style: { color: 'red', fontSize: 16 },
    })
    expect(res).toContain('style={')
    expect(res).toContain('"color": "red"')
  })

  test('handles VariantPropValue with simple values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: '10px',
      default: '20px',
    })
    const res = propsToString({ w: variantProp })
    // 2+ entries always use multiline format
    expect(res).toContain('scroll: "10px"')
    expect(res).toContain('default: "20px"')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with array values (responsive)', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: ['10px', null, '20px'],
      default: ['30px', null, '40px'],
    })
    const res = propsToString({ w: variantProp })
    // Array values trigger multiline format
    expect(res).toContain('scroll: ["10px", null, "20px"]')
    expect(res).toContain('default: ["30px", null, "40px"]')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with numeric values', () => {
    const variantProp = createVariantPropValue('size', {
      sm: 10,
      lg: 20,
    })
    const res = propsToString({ gap: variantProp })
    // 2+ entries always use multiline format
    expect(res).toContain('sm: 10')
    expect(res).toContain('lg: 20')
    expect(res).toContain('[size]')
  })

  test('VariantPropValue triggers newline separator between props', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: '10px',
      default: '20px',
    })
    const res = propsToString({
      w: variantProp,
      h: '100px',
      bg: 'red',
    })
    // VariantPropValue should trigger multiline format for all props
    expect(res).toContain('bg="red"')
    expect(res).toContain('h="100px"')
    expect(res).toContain('[status]')
    expect(res).toContain('\n')
  })

  test('handles VariantPropValue with object values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: { x: 1, y: 2 },
      default: { x: 3, y: 4 },
    })
    const res = propsToString({ transform: variantProp })
    // Object values trigger multiline format with proper indentation
    expect(res).toContain('scroll:')
    expect(res).toContain('"x": 1')
    expect(res).toContain('"y": 2')
    expect(res).toContain('default:')
    expect(res).toContain('"x": 3')
    expect(res).toContain('"y": 4')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with boolean values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: true,
      default: false,
    })
    const res = propsToString({ visible: variantProp })
    // 2+ entries always use multiline format
    expect(res).toContain('scroll: true')
    expect(res).toContain('default: false')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with undefined values in array', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: [undefined, '10px'],
      default: ['20px', undefined],
    })
    const res = propsToString({ w: variantProp })
    // Array values trigger multiline format
    expect(res).toContain('scroll: [undefined, "10px"]')
    expect(res).toContain('default: ["20px", undefined]')
    expect(res).toContain('[status]')
  })

  test('handles VariantPropValue with symbol values (fallback case)', () => {
    const sym = Symbol('test')
    const variantProp = createVariantPropValue('status', {
      scroll: sym as unknown as string,
      default: '20px',
    })
    const res = propsToString({ w: variantProp })
    expect(res).toContain('scroll: Symbol(test)')
    expect(res).toContain('default: "20px"')
  })

  test('handles pseudo-selector prop with nested VariantPropValue', () => {
    // This tests _hover prop with VariantPropValue inside object
    // Covers lines 137-140 (formatObjectValue handling VariantPropValue)
    const nestedVariantProp = createVariantPropValue('variant', {
      primary: '#FF0000',
      white: '#0000FF',
    })
    const res = propsToString({
      _hover: { bg: nestedVariantProp },
    })
    expect(res).toContain('_hover={')
    expect(res).toContain('"bg":')
    expect(res).toContain('primary: "#FF0000"')
    expect(res).toContain('white: "#0000FF"')
    expect(res).toContain('[variant]')
  })

  test('handles pseudo-selector prop with nested object containing VariantPropValue', () => {
    // Tests deep nesting where VariantPropValue is inside a nested object
    // Covers line 93 (formatValueWithIndent handling VariantPropValue)
    const nestedVariantProp = createVariantPropValue('size', {
      sm: { x: 1, y: 2 },
      lg: { x: 3, y: 4 },
    })
    const res = propsToString({
      _active: { transform: nestedVariantProp },
    })
    expect(res).toContain('_active={')
    expect(res).toContain('"transform":')
    expect(res).toContain('sm:')
    expect(res).toContain('lg:')
    expect(res).toContain('[size]')
  })

  test('handles VariantPropValue with single entry (conditional format)', () => {
    // Single entry should use conditional expression format
    const variantProp = createVariantPropValue('status', {
      scroll: '10px',
    })
    const res = propsToString({ w: variantProp })
    // Single entry with primitive value uses conditional expression format
    expect(res).toContain('status === \'scroll\' && "10px"')
  })

  test('handles VariantPropValue with single entry containing spaces in key', () => {
    // Single entry with space in key should use conditional expression format
    const variantProp = createVariantPropValue('property1', {
      'Frame 646': 'solid 1px $border',
    })
    const res = propsToString({ border: variantProp })
    // Key with spaces is properly quoted in conditional expression
    expect(res).toContain('property1 === \'Frame 646\' && "solid 1px $border"')
  })

  test('handles VariantPropValue with null values', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: null,
      default: '20px',
    })
    const res = propsToString({ w: variantProp })
    expect(res).toContain('scroll: null')
    expect(res).toContain('default: "20px"')
  })

  test('handles pseudo-selector prop with deeply nested objects', () => {
    // Tests formatObjectValue recursively handling nested objects
    // Covers lines 138-140 (typeof value === 'object' branch)
    const res = propsToString({
      _hover: {
        transform: { scale: { x: 1.1, y: 1.1 } },
      },
    })
    expect(res).toContain('_hover={')
    expect(res).toContain('"transform":')
    expect(res).toContain('"scale":')
    expect(res).toContain('"x": 1.1')
    expect(res).toContain('"y": 1.1')
  })

  test('handles pseudo-selector prop with array value inside object', () => {
    // Tests formatObjectValue handling array values
    // Covers lines 131-133 (Array.isArray branch in formatObjectValue)
    const res = propsToString({
      _hover: {
        padding: [10, 20, 10, 20],
      },
    })
    expect(res).toContain('_hover={')
    expect(res).toContain('"padding": [10, 20, 10, 20]')
  })

  test('handles VariantPropValue with nested VariantPropValue in multiline format', () => {
    // Tests formatValueWithIndent handling VariantPropValue
    // Covers line 93 (isVariantPropValue branch in formatValueWithIndent)
    const innerVariant = createVariantPropValue('size', {
      sm: '10px',
      lg: '20px',
    })
    const outerVariant = createVariantPropValue('status', {
      scroll: innerVariant,
      default: '30px',
    })
    const res = propsToString({ w: outerVariant })
    // Outer variant should contain inner variant with [size] access
    expect(res).toContain('[status]')
    expect(res).toContain('[size]')
    expect(res).toContain('scroll:')
    expect(res).toContain('default: "30px"')
  })

  test('valueToJsxString handles number and boolean in conditional format', () => {
    // Tests number/boolean handling in valueToJsxString
    // Single entry uses conditional expression format
    const variantPropNumber = createVariantPropValue('status', {
      active: 42,
    })
    const res1 = propsToString({ count: variantPropNumber })
    expect(res1).toContain("status === 'active' && 42")

    const variantPropBool = createVariantPropValue('status', {
      active: true,
    })
    const res2 = propsToString({ visible: variantPropBool })
    expect(res2).toContain("status === 'active' && true")
  })

  test('valueToJsxString handles array in inline format', () => {
    // Tests lines 14-16 (array handling in valueToJsxString)
    // Single entry avoids multiline format, so valueToJsxString is used
    const variantProp = createVariantPropValue('status', {
      active: [1, 2, 3],
    })
    const res = propsToString({ items: variantProp })
    // Single entry with array value still uses multiline format due to needsMultilineFormat check
    expect(res).toContain('[status]')
    expect(res).toContain('active:')
  })

  test('valueToJsxString handles nested VariantPropValue in conditional format', () => {
    // Tests VariantPropValue handling in valueToJsxString
    // This creates a VariantPropValue inside another, but only 1 entry each
    const inner = createVariantPropValue('size', {
      sm: '10px',
    })
    const outer = createVariantPropValue('status', {
      active: inner,
    })
    const res = propsToString({ w: outer })
    expect(res).toContain('[status]')
    // Inner single-entry VariantPropValue uses conditional format
    expect(res).toContain("size === 'sm'")
  })

  test('valueToJsxString handles plain object in inline format', () => {
    // Tests lines 22-23 (plain object handling in valueToJsxString)
    // Single entry with object triggers multiline due to needsMultilineFormat
    const variantProp = createVariantPropValue('status', {
      active: { x: 1 },
    })
    const res = propsToString({ pos: variantProp })
    expect(res).toContain('[status]')
    expect(res).toContain('active:')
    expect(res).toContain('"x": 1')
  })

  test('valueToJsxString handles nested arrays with complex items', () => {
    // Tests valueToJsxString branches when called from formatValueWithIndent's array handling
    // formatValueWithIndent calls valueToJsxString for each array item (line 89)
    // This tests lines 14-16 (array branch) and 22-23 (object branch) in valueToJsxString
    const variantProp = createVariantPropValue('status', {
      scroll: [
        [1, 2],
        [3, 4],
      ], // nested array - hits line 14-16
      default: [{ a: 1 }, { b: 2 }], // array of objects - hits line 22-23
    })
    const res = propsToString({ items: variantProp })
    expect(res).toContain('[status]')
    expect(res).toContain('scroll:')
    expect(res).toContain('default:')
    // Nested arrays should be formatted
    expect(res).toContain('[[1, 2], [3, 4]]')
    // Objects inside array should be JSON stringified
    expect(res).toContain('[{"a":1}, {"b":2}]')
  })

  test('valueToJsxString handles array with VariantPropValue items', () => {
    // Tests line 19-20 (VariantPropValue branch) in valueToJsxString
    // when called from formatValueWithIndent's array handling
    const innerVariant = createVariantPropValue('size', {
      sm: 'small',
      lg: 'large',
    })
    const variantProp = createVariantPropValue('status', {
      active: [innerVariant, 'text'], // array containing VariantPropValue
      inactive: ['just', 'strings'],
    })
    const res = propsToString({ data: variantProp })
    expect(res).toContain('[status]')
    expect(res).toContain('[size]')
    expect(res).toContain('active:')
    expect(res).toContain('inactive:')
  })

  test('valueToJsxString handles fallback to String() for unknown types', () => {
    // Tests line 25 (fallback case) in valueToJsxString
    // Functions and other exotic types fall through to String()
    const fn = function testFn() {}
    const variantProp = createVariantPropValue('status', {
      active: [fn as unknown as string], // function in array
      inactive: ['normal'],
    })
    const res = propsToString({ cb: variantProp })
    expect(res).toContain('[status]')
    expect(res).toContain('function')
  })

  test('formatObjectValue handles function value in pseudo-selector', () => {
    // Tests line 140-141 (fallback case) in formatObjectValue
    // This covers the String(value) fallback for non-standard types
    const fn = function testHandler() {}
    const res = propsToString({
      _hover: { onClick: fn as unknown as string },
    })
    expect(res).toContain('_hover={')
    expect(res).toContain('"onClick":')
    expect(res).toContain('function')
  })

  test('handles VariantPropValue with keys containing spaces', () => {
    const variantProp = createVariantPropValue('property1', {
      'Frame 646': '$containerBackground',
      'Frame 647': '$primaryAccent',
    })
    const res = propsToString({ bg: variantProp })
    // Keys with spaces should be quoted
    expect(res).toContain("'Frame 646': ")
    expect(res).toContain("'Frame 647': ")
    expect(res).toContain('[property1]')
  })

  test('handles VariantPropValue with keys containing special characters', () => {
    const variantProp = createVariantPropValue('status', {
      'my-value': '10px',
      'another.value': '20px',
    })
    const res = propsToString({ w: variantProp })
    expect(res).toContain("'my-value': ")
    expect(res).toContain("'another.value': ")
  })

  test('handles VariantPropValue with valid identifier keys (no quotes)', () => {
    const variantProp = createVariantPropValue('status', {
      scroll: '10px',
      _default: '20px',
      $special: '30px',
    })
    const res = propsToString({ w: variantProp })
    // Valid identifiers should NOT be quoted
    expect(res).toContain('scroll: ')
    expect(res).toContain('_default: ')
    expect(res).toContain('$special: ')
    expect(res).not.toContain("'scroll'")
    expect(res).not.toContain("'_default'")
    expect(res).not.toContain("'$special'")
  })

  test('typography prop uses as const for literal type inference', () => {
    const variantProp = createVariantPropValue('property1', {
      'Frame 646': 'body',
      'Frame 647': 'bodyBold',
    })
    const res = propsToString({ typography: variantProp })
    // typography should use as const pattern
    expect(res).toContain('as const')
    expect(res).toContain(')[property1]')
    expect(res).toContain('\'Frame 646\': "body"')
    expect(res).toContain('\'Frame 647\': "bodyBold"')
  })

  test('typography prop with single entry uses as const (not conditional)', () => {
    const variantProp = createVariantPropValue('property1', {
      'Frame 646': 'body',
    })
    const res = propsToString({ typography: variantProp })
    // Single entry typography should still use object pattern with as const
    expect(res).toContain('as const')
    expect(res).toContain('[property1]')
    // Should NOT use conditional expression for typography
    expect(res).not.toContain("property1 === 'Frame 646'")
  })

  test('non-typography prop does not use as const', () => {
    const variantProp = createVariantPropValue('property1', {
      'Frame 646': 'body',
      'Frame 647': 'bodyBold',
    })
    const res = propsToString({ fontFamily: variantProp })
    // non-typography props should NOT use as const
    expect(res).not.toContain('as const')
    expect(res).toContain('[property1]')
  })
})
