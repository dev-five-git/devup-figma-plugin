import {
  cssToProps,
  fixChildrenText,
  formatSvg,
  organizeProps,
  space,
} from '../utils'

describe('organizeProps', () => {
  it('should organize props', () => {
    expect(organizeProps({})).toEqual({})
  })
  it.each(['p', 'm'])('should organize space props', (pro) => {
    expect(organizeProps({ [pro]: '10px 10px 10px 10px' })).toEqual({
      [pro]: '10px',
    })
    expect(organizeProps({ [pro]: '10px 20px 30px 40px' })).toEqual({
      [pro]: '10px 20px 30px 40px',
    })
    expect(organizeProps({ [pro]: '10px 0px 10px 0px' })).toEqual({
      [pro + 'y']: '10px',
    })
    expect(organizeProps({ [pro]: '0px 10px 0px 10px' })).toEqual({
      [pro + 'x']: '10px',
    })
    expect(organizeProps({ [pro]: '10px 20px 20px 20px' })).toEqual({
      [pro + 'x']: '20px',
      [pro + 't']: '10px',
      [pro + 'b']: '20px',
    })
    expect(organizeProps({ [pro]: '10px 20px 10px 20px' })).toEqual({
      [pro + 'x']: '20px',
      [pro + 'y']: '10px',
    })
    expect(organizeProps({ [pro]: '10px 10px' })).toEqual({
      [pro]: '10px',
    })
    expect(organizeProps({ [pro]: '1px' })).toEqual({
      [pro]: '1px',
    })
    expect(organizeProps({ [pro]: '1px 2px' })).toEqual({
      [pro + 'x']: '2px',
      [pro + 'y']: '1px',
    })
    expect(organizeProps({ [pro]: '0px 2px' })).toEqual({
      [pro + 'x']: '2px',
    })
    expect(organizeProps({ [pro]: '1px 2px 30px' })).toEqual({
      [pro + 't']: '1px',
      [pro + 'x']: '2px',
      [pro + 'b']: '30px',
    })
    expect(organizeProps({ [pro]: '0px 2px 0px' })).toEqual({
      [pro + 'x']: '2px',
    })
    expect(organizeProps({ [pro]: '30px 2px 30px 4px' })).toEqual({
      [pro + 'y']: '30px',
      [pro + 'r']: '2px',
      [pro + 'l']: '4px',
    })
    expect(organizeProps({ [pro]: '0px' })).toEqual({})
    expect(organizeProps({ [pro]: '0px 0px' })).toEqual({})
    expect(organizeProps({ [pro]: '0px 0px 0px' })).toEqual({})
    expect(organizeProps({ [pro]: '0px 0px 0px 0px' })).toEqual({})
    expect(organizeProps({ [pro]: '10px 8px 10px 6px' })).toEqual({
      [pro + 'y']: '10px',
      [pro + 'r']: '8px',
      [pro + 'l']: '6px',
    })
  })

  it('should organize space props 2', () => {
    expect(
      organizeProps({ p: '10px 20px 10px 20px', m: '10px 20px 10px 20px' }),
    ).toEqual({
      px: '20px',
      py: '10px',
      mx: '20px',
      my: '10px',
    })
  })

  it('should change image url', () => {
    expect(organizeProps({ bg: 'url(<path-to-image>)' })).toEqual({
      bg: 'url(/path/to/image)',
    })
  })

  it('should change props when value is default value', () => {
    expect(organizeProps({ p: '0px' })).toEqual({})
    expect(organizeProps({ m: '0px' })).toEqual({})
    expect(organizeProps({ flex: '1 0 0' })).toEqual({ flex: '1' })
  })

  it('should split comment', () => {
    expect(organizeProps({ p: '10px /* comment */' })).toEqual({
      p: '10px',
    })
  })

  it('should disattach "', () => {
    expect(organizeProps({ p: '"10px"' })).toEqual({
      p: '10px',
    })
  })

  it('should delete empty props', () => {
    expect(organizeProps({ p: '' })).toEqual({})
    expect(organizeProps({ some: '' })).toEqual({})
  })

  it('should extract variable props', () => {
    expect(organizeProps({ bg: 'var(--primary)' })).toEqual({
      bg: '$primary',
    })

    expect(organizeProps({ bg: 'var(--PASCAL_CASE)' })).toEqual({
      bg: '$pascalCase',
    })

    expect(
      organizeProps({
        bg: 'linear-gradient(202deg, var(--primary, #5B34F7) 3.96%, #6D7EDC 85.94%)',
      }),
    ).toEqual({
      bg: 'linear-gradient(202deg, $primary 3.96%, #6D7EDC 85.94%)',
    })

    expect(
      organizeProps({
        bg: '0px 0px 15px 0px var(--clientShadow, rgba(0, 0, 0, 0.07))',
      }),
    ).toEqual({
      bg: '0 0 15px 0 $clientShadow',
    })

    expect(
      organizeProps({
        bg: '0px 0px 15px 0px var(--clientShadow, var(--primary, rgba(0, 0, 0, 0.07)))',
      }),
    ).toEqual({
      bg: '0 0 15px 0 $clientShadow',
    })
  })
})

describe('space', () => {
  it('should create space', () => {
    expect(space(0)).toEqual('')
    expect(space(1)).toEqual('  ')
    expect(space(2)).toEqual('    ')
  })
})
describe('cssToProps', () => {
  it('should transform css to props', () => {
    expect(
      cssToProps({
        color: 'red',
        fontSize: '16px',
        fontFamily: 'Arial',
      }),
    ).toEqual({
      color: 'red',
      fontSize: '16px',
      fontFamily: 'Arial',
    })
  })
  it('should transform css to props with shorthand', () => {
    expect(
      cssToProps({
        margin: '10px',
        padding: '20px',
        position: 'absolute',
      }),
    ).toEqual({
      m: '10px',
      p: '20px',
      pos: 'absolute',
    })
  })
  it('should merge css to props with shorthand', () => {
    expect(
      cssToProps({
        'margin-top': '10px',
        'margin-bottom': '10px',
      }),
    ).toEqual({
      my: '10px',
    })
    expect(
      cssToProps({
        'margin-left': '10px',
        'margin-right': '10px',
      }),
    ).toEqual({
      mx: '10px',
    })
    expect(
      cssToProps({
        'margin-top': '10px',
        'margin-bottom': '10px',
        'margin-right': '10px',
        'margin-left': '10px',
      }),
    ).toEqual({
      m: '10px',
    })
    expect(
      cssToProps({
        width: '100px',
        height: '100px',
      }),
    ).toEqual({
      boxSize: '100px',
    })
  })
})

describe('formatSvg', () => {
  it('should format svg', () => {
    expect(formatSvg('<svg>\n</svg>')).toEqual('<svg>\n</svg>')
    expect(formatSvg('<svg>\n<path>\n</path>\n</svg>')).toEqual(
      '<svg>\n  <path>\n  </path>\n</svg>',
    )
    expect(
      formatSvg('<svg>\n<path>\n</path>\n<path>\n</path>\n</svg>'),
    ).toEqual('<svg>\n  <path>\n  </path>\n  <path>\n  </path>\n</svg>')
    expect(
      formatSvg('<svg>\n<path>\n</path>\n<path>\n</path>\n</svg>', 1),
    ).toEqual(
      '  <svg>\n    <path>\n    </path>\n    <path>\n    </path>\n  </svg>',
    )
    expect(formatSvg('<svg />', 1)).toEqual('  <svg />')
  })
})

describe('fixChildrenText', () => {
  it.each([
    ['{', '{"{"}'],
    ['}', '{"}"}'],
    ['&', '{"&"}'],
    ['>', '{">"}'],
    ['<', '{"<"}'],
    ['{wow', '{"{"}wow'],
    ['{wow{', '{"{"}wow{"{"}'],
    ['{wow{wow', '{"{"}wow{"{"}wow'],
    ['{wow{wow}', '{"{"}wow{"{"}wow{"}"}'],
    ['{wow{wow{', '{"{"}wow{"{"}wow{"{"}'],
    ['{wow{wow{wow', '{"{"}wow{"{"}wow{"{"}wow'],
    ['{wow{wow{wow}', '{"{"}wow{"{"}wow{"{"}wow{"}"}'],
  ])('should fix children text with special characters', (input, output) => {
    expect(fixChildrenText(input)).toEqual(output)
  })
})
