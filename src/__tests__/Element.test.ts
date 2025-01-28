import { describe } from 'vitest'

import { Element } from '../Element'

function createNode(
  type: SceneNode['type'],
  {
    characters,
    children,
    textStyleId,
    name,
    fills,
    parent,
    ...props
  }: {
    [_: string]: any
    characters?: string
    name?: string
    textStyleId?: string
    children?: SceneNode[]
  } = {},
): SceneNode {
  return {
    type,
    getCSSAsync: async () => props,
    exportAsync: async () => '<svg>\n<path/>\n</svg>',
    textStyleId,
    parent,
    characters,
    width: props.width ? parseInt(props.width) : undefined,
    height: props.height ? parseInt(props.height) : undefined,
    name,
    fills,
    children: children ?? [],
  } as unknown as SceneNode
}

function createElement(
  type: SceneNode['type'],
  {
    characters,
    children,
    ...props
  }: {
    [_: string]: any
    characters?: string
    children?: SceneNode[]
  } = {},
) {
  return new Element(createNode(type, { characters, children, ...props }))
}

describe('Element', () => {
  describe('ComponentType', () => {
    it('ELLIPSE', async () => {
      {
        const element = createElement('ELLIPSE')
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual('<Box borderRadius="50%" />')
        expect(await element.getProps()).toEqual({})
      }
      {
        const element = createElement('ELLIPSE', {
          fill: 'red',
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box borderRadius="50%" bg="red" />',
        )
      }
    })

    it('Box', async () => {
      const outer = createNode('RECTANGLE', {
        width: '60px',
        fills: [],
      })
      const inner = createNode('RECTANGLE', {
        width: '60px',
        fills: [],
        parent: outer,
      })
      ;(outer as any).children = [inner]
      const element = new Element(outer)
      expect(await element.getComponentType()).toEqual('Box')
      expect(await element.render()).toEqual(
        '<Box w="60px">\n  <Box w="100%" />\n</Box>',
      )
    })

    describe('Image', () => {
      it('VECTOR', async () => {
        const element = createElement('VECTOR', {
          name: 'image',
          width: '60px',
          height: '60px',
        })
        expect(await element.getComponentType()).toEqual('Image')
        expect(await element.render()).toEqual(
          '<Image boxSize="60px" src="image" />',
        )
      })
      it('STAR', async () => {
        const element = createElement('STAR', {
          name: 'image',
          width: '60px',
          height: '60px',
        })
        expect(await element.getComponentType()).toEqual('Image')
        expect(await element.render()).toEqual(
          '<Image boxSize="60px" src="image" />',
        )
      })

      describe('Overlap', async () => {
        it('should render Image with overlap', async () => {
          const element = createElement('INSTANCE', {
            name: 'image',
            width: '60px',
            height: '60px',
            children: [
              createNode('VECTOR', {
                fills: [],
              }),
              createNode('STAR', {
                fills: [],
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('Image')
          expect(await element.render()).toEqual(
            '<Image boxSize="60px" src="image" />',
          )
        })

        it('should render Image with overlap', async () => {
          {
            const element = createElement('INSTANCE', {
              name: 'image',
              width: '60px',
              height: '60px',
              children: [
                createNode('VECTOR', {
                  fills: [],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Image')
            expect(await element.render()).toEqual(
              '<Image boxSize="60px" src="image" />',
            )
          }
          {
            const element = createElement('FRAME', {
              name: 'image',
              width: '60px',
              height: '60px',
              'flex-shrink': '0',
              children: [
                createNode('GROUP', {
                  width: '60px',
                  height: '59.691px',
                  'flex-shrink': '0',
                  children: [
                    createNode('GROUP', {
                      width: '60px',
                      height: '59.691px',
                      'flex-shrink': '0',
                      filter: 'drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.16))',
                      children: [
                        createNode('VECTOR', {
                          width: '60px',
                          height: '59.691px',
                          'flex-shrink': '0',
                          fill: '#231815',
                        }),
                      ],
                    }),
                    createNode('GROUP', {
                      width: '44.047px',
                      height: '28.741px',
                      'flex-shrink': '0',
                      children: [
                        createNode('GROUP', {
                          width: '44.047px',
                          height: '28.741px',
                          'flex-shrink': '0',
                          children: [
                            createNode('VECTOR', {
                              width: '17.003px',
                              height: '28.741px',
                              'flex-shrink': '0',
                              fill: 'var(--containerBackground, #FFF)',
                            }),
                            createNode('VECTOR', {
                              width: '17.003px',
                              height: '28.741px',
                              'flex-shrink': '0',
                              fill: 'var(--containerBackground, #FFF)',
                            }),
                            createNode('VECTOR', {
                              width: '17.003px',
                              height: '28.741px',
                              'flex-shrink': '0',
                              fill: 'var(--containerBackground, #FFF)',
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Image')
            expect(await element.render()).toEqual(
              '<Image boxSize="60px" src="image" />',
            )
          }
        })
      })

      describe('Compound Image', () => {
        it('should render Image and Text', async () => {
          {
            const element = createElement('FRAME', {
              display: 'flex',
              'align-items': 'center',
              gap: '20px',
              'align-self': 'stretch',
              children: [
                createNode('GROUP', {
                  display: 'flex',
                  'justify-content': 'center',
                  'align-items': 'center',
                  width: '60px',
                  height: '60px',
                  name: 'image',
                  gap: '10px',
                  children: [
                    createNode('VECTOR', {
                      width: '17.003px',
                      height: '28.741px',
                      'flex-shrink': '0',
                      fill: '#231815',
                    }),
                  ],
                }),
                createNode('TEXT', {
                  characters: 'Text',
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Flex')
            expect(await element.render()).toEqual(
              `<Flex alignItems="center" gap="20px">
  <Image boxSize="60px" src="image" />
  <Text>
    Text
  </Text>
</Flex>`,
            )
          }

          {
            const element = createElement('FRAME', {
              display: 'flex',
              'align-items': 'center',
              gap: '20px',
              'align-self': 'stretch',
              children: [
                createNode('VECTOR', {
                  width: '17.003px',
                  height: '28.741px',
                  'flex-shrink': '0',
                  fill: 'var(--containerBackground, #FFF)',
                }),
                createNode('TEXT', {
                  characters: 'Text',
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Flex')
            expect(await element.render())
              .toEqual(`<Flex alignItems="center" gap="20px">
  <svg className={css({ color: "$containerBackground" })}>
    <path/>
  </svg>
  <Text>
    Text
  </Text>
</Flex>`)
          }

          {
            const element = createElement('FRAME', {
              display: 'flex',
              'align-items': 'center',
              'align-self': 'stretch',
              children: [
                createNode('VECTOR', {
                  name: 'image',
                  width: '20px',
                  height: '20px',
                  'flex-shrink': '0',
                  fill: '#231815',
                }),
                createNode('GROUP', {
                  children: [
                    createNode('TEXT', {
                      characters: 'Text',
                    }),
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Flex')
            expect(await element.render()).toEqual(
              `<Flex alignItems="center">
  <Image boxSize="20px" src="image" />
  <Box>
    <Text>
      Text
    </Text>
  </Box>
</Flex>`,
            )
          }
        })
      })
    })

    describe('Svg', () => {
      it('should render variant svg', async () => {
        const element = createElement('FRAME', {
          width: '24px',
          height: '24px',
          children: [
            createNode('VECTOR', {
              width: '20.001px',
              height: '20px',
              'flex-shrink': '0',
              fill: 'var(--title, #1A1A1A)',
            }),
          ],
        })
        expect(await element.render()).toEqual(
          '<svg className={css({ color: "$title" })}>\n  <path/>\n</svg>',
        )
      })
    })

    describe('Text', () => {
      it('should render Text', async () => {
        const element = createElement('TEXT')
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual('<Text />')
      })
      it('should render Text with char', async () => {
        const element = createElement('TEXT', {
          characters: 'a',
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual('<Text>\n  a\n</Text>')
      })
      it('should render Text with typography', async () => {
        const getStyleByIdAsync = vi.fn().mockResolvedValue({
          fontName: {
            family: 'Roboto',
            style: 'Italic',
          },
          name: 'button-title',
        })
        ;(globalThis as any).figma = {
          getStyleByIdAsync,
        }
        const element = createElement('TEXT', {
          characters: 'a',
          'font-family': 'Roboto',
          'font-style': 'Italic',
          'font-weight': 400,
          'font-size': '16px',
          textStyleId: '1',
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual(
          '<Text typography="button-title">\n  a\n</Text>',
        )
      })
    })
    describe('Flex', () => {
      it('should render Flex', async () => {
        {
          const element = createElement('FRAME', {
            display: 'flex',
          })
          expect(await element.getComponentType()).toEqual('Flex')
          expect(await element.render()).toEqual('<Flex />')
        }
        {
          const element = createElement('FRAME', {
            display: 'inline-flex',
          })
          expect(await element.getComponentType()).toEqual('Flex')
          expect(await element.render()).toEqual('<Flex />')
        }
      })
    })
    describe('Center', () => {
      it('should render Center', async () => {
        const element = createElement('FRAME', {
          children: [
            createNode('TEXT', {
              characters: 'I am centered',
            }),
          ],
          'align-items': 'center',
          'justify-content': 'center',
          display: 'flex',
        })
        expect(await element.getComponentType()).toEqual('Center')
        expect(await element.render()).toEqual(
          '<Center>\n  <Text>\n    I am centered\n  </Text>\n</Center>',
        )
      })
    })
    describe('VStack', () => {
      it('should render VStack', async () => {
        const element = createElement('FRAME', {
          display: 'flex',
          'flex-direction': 'column',
        })
        expect(await element.getComponentType()).toEqual('VStack')
        expect(await element.render()).toEqual('<VStack />')
      })
    })
  })
})
