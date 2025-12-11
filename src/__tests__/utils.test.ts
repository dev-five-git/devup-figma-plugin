import { describe, expect, it, test } from 'bun:test'
import { getComponentName, space } from '../utils'

describe('space', () => {
  it('should create space', () => {
    expect(space(0)).toEqual('')
    expect(space(1)).toEqual('  ')
    expect(space(2)).toEqual('    ')
  })
})

describe('getComponentName', () => {
  test.each([
    {
      description: 'should return pascal case name for COMPONENT_SET',
      node: {
        type: 'COMPONENT_SET',
        name: 'button-component',
      } as unknown as SceneNode,
      expected: 'ButtonComponent',
    },
    {
      description:
        'should return parent name for COMPONENT with COMPONENT_SET parent',
      node: {
        type: 'COMPONENT',
        name: 'button-variant',
        parent: {
          type: 'COMPONENT_SET',
          name: 'button-set',
        } as unknown as SceneNode,
      } as unknown as SceneNode,
      expected: 'ButtonSet',
    },
    {
      description:
        'should return node name for COMPONENT without COMPONENT_SET parent',
      node: {
        type: 'COMPONENT',
        name: 'button-component',
        parent: null,
      } as unknown as SceneNode,
      expected: 'ButtonComponent',
    },
    {
      description: 'should return pascal case name for FRAME',
      node: {
        type: 'FRAME',
        name: 'my-frame',
      } as unknown as SceneNode,
      expected: 'MyFrame',
    },
    {
      description: 'should return pascal case name for RECTANGLE',
      node: {
        type: 'RECTANGLE',
        name: 'my-rectangle',
      } as unknown as SceneNode,
      expected: 'MyRectangle',
    },
    {
      description: 'should return pascal case name for TEXT',
      node: {
        type: 'TEXT',
        name: 'my-text',
      } as unknown as SceneNode,
      expected: 'MyText',
    },
  ])('$description', ({ node, expected }) => {
    expect(getComponentName(node)).toBe(expected)
  })
})
