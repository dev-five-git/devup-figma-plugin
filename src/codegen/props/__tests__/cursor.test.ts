import { describe, expect, test } from 'bun:test'
import { getCursorProps } from '../cursor'

describe('getCursorProps', () => {
  test('returns empty object when node has no reactions property', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
    } as SceneNode

    expect(getCursorProps(node)).toEqual({})
  })

  test('returns empty object when node.reactions is null', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
      reactions: null,
    } as unknown as SceneNode

    expect(getCursorProps(node)).toEqual({})
  })

  test('returns empty object when node.reactions is empty array', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
      reactions: [],
    } as unknown as SceneNode

    expect(getCursorProps(node)).toEqual({})
  })

  test('returns cursor: pointer when reaction has ON_CLICK trigger', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
      reactions: [
        {
          trigger: { type: 'ON_CLICK' },
          actions: [{ type: 'NODE', destinationId: '123' }],
        },
      ],
    } as unknown as SceneNode

    expect(getCursorProps(node)).toEqual({ cursor: 'pointer' })
  })

  test('returns empty object when reaction has non-click trigger', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
      reactions: [
        {
          trigger: { type: 'ON_HOVER' },
          actions: [{ type: 'NODE', destinationId: '123' }],
        },
      ],
    } as unknown as SceneNode

    expect(getCursorProps(node)).toEqual({})
  })

  test('returns cursor: pointer when any reaction has ON_CLICK trigger among multiple', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
      reactions: [
        {
          trigger: { type: 'ON_HOVER' },
          actions: [{ type: 'NODE', destinationId: '123' }],
        },
        {
          trigger: { type: 'ON_CLICK' },
          actions: [{ type: 'NODE', destinationId: '456' }],
        },
        {
          trigger: { type: 'AFTER_TIMEOUT' },
          actions: [{ type: 'NODE', destinationId: '789' }],
        },
      ],
    } as unknown as SceneNode

    expect(getCursorProps(node)).toEqual({ cursor: 'pointer' })
  })

  test('returns empty object when reaction trigger is undefined', () => {
    const node = {
      type: 'FRAME',
      name: 'Test',
      reactions: [
        {
          trigger: undefined,
          actions: [{ type: 'NODE', destinationId: '123' }],
        },
      ],
    } as unknown as SceneNode

    expect(getCursorProps(node)).toEqual({})
  })
})
