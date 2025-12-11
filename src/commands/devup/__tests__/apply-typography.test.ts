import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { applyTypography } from '../apply-typography'

describe('applyTypography', () => {
  afterEach(() => {
    ;(globalThis as { figma?: unknown }).figma = undefined
  })

  afterAll(() => {
    mock.restore()
  })

  test('applies typography to a newly created style', async () => {
    const styleObj = { name: '' } as unknown as TextStyle
    const createTextStyle = mock(() => styleObj)
    const loadFontAsync = mock(() => Promise.resolve())
    const notify = mock(() => {})

    ;(globalThis as { figma?: unknown }).figma = {
      createTextStyle,
      loadFontAsync,
      notify,
    } as unknown as typeof figma

    await applyTypography(
      'mobile/title',
      {
        fontFamily: 'Inter',
        fontStyle: 'italic',
        fontSize: '14',
        letterSpacing: '0.1em',
        lineHeight: 'normal',
        textTransform: 'uppercase',
        textDecoration: 'underline',
      },
      [],
    )

    expect(createTextStyle).toHaveBeenCalled()
    expect(loadFontAsync).toHaveBeenCalled()
    expect((styleObj as unknown as { fontName: FontName }).fontName).toEqual({
      family: 'Inter',
      style: 'Italic',
    })
    expect((styleObj as unknown as { fontSize: number }).fontSize).toBe(14)
    expect(
      (styleObj as unknown as { letterSpacing: LetterSpacing }).letterSpacing,
    ).toEqual({ unit: 'PERCENT', value: 0.1 })
    expect(
      (styleObj as unknown as { lineHeight: LineHeight }).lineHeight,
    ).toEqual({ unit: 'AUTO' })
    expect((styleObj as unknown as { textCase: string }).textCase).toBe(
      'UPPERCASE',
    )
    expect(
      (styleObj as unknown as { textDecoration: TextDecoration })
        .textDecoration,
    ).toBe('UNDERLINE')
    expect(notify).not.toHaveBeenCalled()
  })

  test('notifies on font load failure and leaves style untouched', async () => {
    const styleObj = { name: '' } as unknown as TextStyle
    const createTextStyle = mock(() => styleObj)
    const loadFontAsync = mock(() => Promise.reject('font'))
    const notify = mock(() => {})

    ;(globalThis as { figma?: unknown }).figma = {
      createTextStyle,
      loadFontAsync,
      notify,
    } as unknown as typeof figma
    spyOn(console, 'error').mockImplementation(() => {})

    await applyTypography(
      'mobile/title',
      {
        fontFamily: 'Inter',
        fontSize: '12',
        letterSpacing: '2', // triggers PIXELS branch if it were to run
        lineHeight: 120,
      },
      [],
    )

    expect(loadFontAsync).toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining('Failed to create text style'),
      { error: true },
    )
    expect(console.error).toHaveBeenCalledWith(
      'Failed to create text style',
      'font',
    )
  })

  test('applies px letterSpacing and percent lineHeight on existing style', async () => {
    const styleObj = {
      name: 'mobile/body',
    } as unknown as TextStyle
    const loadFontAsync = mock(() => Promise.resolve())
    const notify = mock(() => {})

    ;(globalThis as { figma?: unknown }).figma = {
      loadFontAsync,
      notify,
      createTextStyle: mock(() => styleObj),
    } as unknown as typeof figma

    await applyTypography(
      'mobile/body',
      {
        fontFamily: 'Inter',
        fontSize: '16',
        letterSpacing: '2',
        lineHeight: 120,
      },
      [styleObj],
    )

    expect(
      (styleObj as unknown as { letterSpacing: LetterSpacing }).letterSpacing,
    ).toEqual({ unit: 'PIXELS', value: 200 })
    expect(
      (styleObj as unknown as { lineHeight: LineHeight }).lineHeight,
    ).toEqual({
      unit: 'PERCENT',
      value: 1.2,
    })
    expect(loadFontAsync).toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  test('applies string lineHeight as pixels', async () => {
    const styleObj = { name: '' } as unknown as TextStyle
    const createTextStyle = mock(() => styleObj)
    const loadFontAsync = mock(() => Promise.resolve())

    ;(globalThis as { figma?: unknown }).figma = {
      createTextStyle,
      loadFontAsync,
      notify: mock(() => {}),
    } as unknown as typeof figma

    await applyTypography(
      'mobile/caption',
      {
        fontFamily: 'Inter',
        fontSize: '11',
        lineHeight: '24',
      },
      [],
    )

    expect(
      (styleObj as unknown as { lineHeight: LineHeight }).lineHeight,
    ).toEqual({ unit: 'PIXELS', value: 24 })
  })
})
