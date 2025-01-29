import { cssToProps, formatSvg, organizeProps, space } from '../utils'

describe('organizeProps', () => {
  it('should organize props', () => {
    expect(organizeProps({})).toEqual({})
  })
  it('should optimize space props', () => {
    expect(organizeProps({ p: '10px 10px 10px 10px' })).toEqual({
      p: '10px',
    })
    expect(organizeProps({ p: '10px 20px 30px 40px' })).toEqual({
      p: '10px 20px 30px 40px',
    })
    expect(organizeProps({ p: '10px 0px 10px 0px' })).toEqual({
      py: '10px',
    })
    expect(organizeProps({ p: '0px 10px 0px 10px' })).toEqual({
      px: '10px',
    })
    expect(organizeProps({ p: '10px 20px 20px 20px' })).toEqual({
      p: '10px 20px 20px',
    })
    expect(organizeProps({ p: '10px 20px 10px 20px' })).toEqual({
      p: '10px 20px',
    })
    expect(organizeProps({ p: '10px 10px' })).toEqual({
      p: '10px',
    })
    expect(organizeProps({ p: '1px' })).toEqual({
      p: '1px',
    })
    expect(organizeProps({ p: '1px 2px' })).toEqual({
      p: '1px 2px',
    })
    expect(organizeProps({ p: '1px 2px 30px' })).toEqual({
      p: '1px 2px 30px',
    })

    expect(organizeProps({ p: '30px 2px 30px 4px' })).toEqual({
      p: '30px 2px 30px 4px',
    })
    expect(organizeProps({ p: '0px' })).toEqual({})
    expect(organizeProps({ p: '0px 0px' })).toEqual({})
    expect(organizeProps({ p: '0px 0px 0px' })).toEqual({})
    expect(organizeProps({ p: '0px 0px 0px 0px' })).toEqual({})

    expect(organizeProps({ m: '10px 10px 10px 10px' })).toEqual({
      m: '10px',
    })
    expect(organizeProps({ m: '10px 20px 30px 40px' })).toEqual({
      m: '10px 20px 30px 40px',
    })
    expect(organizeProps({ m: '0px 10px 0px 10px' })).toEqual({
      mx: '10px',
    })
    expect(organizeProps({ m: '10px 0px 10px 0px' })).toEqual({
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

  it('should delete empty props', () => {
    expect(organizeProps({ p: '' })).toEqual({})
    expect(organizeProps({ some: '' })).toEqual({})
  })

  it('should extract variable props', () => {
    expect(organizeProps({ bg: 'var(--primary)' })).toEqual({
      bg: '$primary',
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
