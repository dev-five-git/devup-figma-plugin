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
    layoutPositioning = 'AUTO',
    layoutSizingHorizontal,
    styledTextSegments = [],
    ...props
  }: {
    [_: string]: any
    characters?: string
    name?: string
    textStyleId?: string
    children?: SceneNode[]
    layoutPositioning?: string
    styledTextSegments?: any[]
  } = {},
): SceneNode {
  const ret = {
    type,
    getCSSAsync: async () => props,
    exportAsync: async () => '<svg>\n<path/>\n</svg>',
    getStyledTextSegments: () => styledTextSegments,
    layoutSizingHorizontal,
    textStyleId,
    parent,
    characters,
    visible: true,
    layoutPositioning,
    width: props.width ? parseInt(props.width) : undefined,
    height: props.height ? parseInt(props.height) : undefined,
    name,
    fills,
    children: children ?? [],
  } as unknown as SceneNode
  ;(ret as any).children.forEach((child: any) => {
    ;(child as any).parent = ret
  })

  return ret
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
      {
        const element = createElement('RECTANGLE', {
          border: 'solid 1px var(--containerBackground, #FFF)',
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box border="solid 1px $containerBackground" />',
        )
      }
      {
        const element = createElement('RECTANGLE', {
          border: 'solid 1px var(--containerBackground)',
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box border="solid 1px $containerBackground" />',
        )
      }
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
        it('should split Element when children have instance type', async () => {
          const element = createElement('FRAME', {
            display: 'flex',
            'align-items': 'center',
            'align-self': 'stretch',
            children: [
              createNode('INSTANCE', {
                name: 'image',
                width: '60px',
                height: '60px',
                children: [
                  createNode('VECTOR', {
                    width: '17.003px',
                    height: '28.741px',
                    'flex-shrink': '0',
                    fill: '#231815',
                  }),
                ],
              }),
              createNode('VECTOR', {
                name: 'image',
                width: '17.003px',
                height: '28.741px',
                'flex-shrink': '0',
                fill: '#231815',
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('Flex')
          expect(await element.render()).toEqual(
            `<Flex alignItems="center">
  <Image boxSize="60px" src="image" />
  <Image w="17px" h="28px" src="image" />
</Flex>`,
          )
        })
        it('should render Image with aspect ratio', async () => {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '60px',
            'flex-direction': 'column',
            children: [
              createNode('VECTOR', {
                name: 'image',
                width: '60px',
                height: '60px',
                fills: [],
              }),
              createNode('TEXT', {
                width: '60px',
                height: '60px',
                fills: [],
              }),
            ],
          })
          expect(await element.render()).toEqual(
            '<VStack w="60px">\n  <Image w="100%" src="image" aspectRatio="1" />\n  <Text />\n</VStack>',
          )
        })
      })
      it('should Image has not padding', async () => {
        const element = createElement('INSTANCE', {
          display: 'flex',
          width: '28px',
          height: '28px',
          'justify-content': 'center',
          'align-items': 'center',
          padding: '10px',
          name: 'image',
          children: [
            createNode('VECTOR', {
              width: '28px',
              height: '28px',
              'flex-shrink': '0',
              fill: '#231815',
            }),
          ],
        })
        expect(await element.getComponentType()).toEqual('Image')
        expect(await element.render()).toEqual(
          '<Image boxSize="28px" src="image" />',
        )
      })
      describe('Rectangle', () => {
        it('should render Image with rectangle', async () => {
          {
            const element = createElement('RECTANGLE', {
              name: 'image',
              width: '60px',
              height: '60px',
              fills: [
                {
                  type: 'IMAGE',
                },
              ],
            })
            expect(await element.getComponentType()).toEqual('Image')
            expect(await element.render()).toEqual(
              '<Image boxSize="60px" src="image" />',
            )
          }
          {
            const element = createElement('FRAME', {
              display: 'flex',
              width: '6px',
              'align-items': 'flex-start',
              'align-self': 'stretch',
              background: 'var(--menuHover, #F6F4FF)',
              children: [
                createNode('RECTANGLE', {
                  height: '318px',
                  flex: '1 0 0',
                  'border-radius': '100px',
                  background: 'var(--third, #918AE9)',
                  fills: [],
                }),
                createNode('RECTANGLE', {
                  width: '6px',
                  height: '6px',
                  name: 'image',
                  fills: [
                    {
                      type: 'IMAGE',
                    },
                  ],
                }),
              ],
            })
            expect(await element.render())
              .toEqual(`<Flex w="6px" bg="$menuHover">
  <Box h="318px" flex="1" borderRadius="100px" bg="$third" />
  <Image w="100%" src="image" aspectRatio="1" />
</Flex>`)
          }
        })
        it('should render Rectangle', async () => {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '6px',
            'align-items': 'flex-start',
            gap: '10px',
            'align-self': 'stretch',
            background: 'var(--menuHover, #F6F4FF)',
            children: [
              createNode('RECTANGLE', {
                height: '318px',
                flex: '1 0 0',
                'border-radius': '100px',
                background: 'var(--third, #918AE9)',
                fills: [],
              }),
              createNode('RECTANGLE', {
                width: '6px',
                height: '6px',
                fills: [],
              }),
            ],
          })
          expect(await element.render())
            .toEqual(`<Flex w="6px" gap="10px" bg="$menuHover">
  <Box h="318px" flex="1" borderRadius="100px" bg="$third" />
  <Box w="100%" h="6px" />
</Flex>`)
        })
      })
    })

    describe('Svg', () => {
      it('should render variant svg', async () => {
        {
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
        }
      })
    })

    describe('Text', () => {
      it('should render Text', async () => {
        {
          const element = createElement('TEXT')
          expect(await element.getComponentType()).toEqual('Text')
          expect(await element.render()).toEqual('<Text />')
        }
        {
          const element = createElement('TEXT', {
            fontFamily: '"Roboto"',
            lineHeight: '30px /* 157.895% */',
          })
          expect(await element.getComponentType()).toEqual('Text')
          expect(await element.render()).toEqual(
            '<Text fontFamily="Roboto" lineHeight="30px" />',
          )
        }
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
      it('should render many Text', async () => {
        const element = createElement('TEXT', {
          characters: 'ab',
          styledTextSegments: [
            {
              start: 0,
              end: 1,
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textDecoration: 'NONE',
              fontWeight: 400,
              textCase: 'UPPER',
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              characters: 'a',
              fontSize: 16,
            },
            {
              fontSize: 16,
              characters: 'b',
              start: 1,
              end: 2,
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textCase: 'UPPER',
              textDecoration: 'NONE',
              fontWeight: 700,
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
            },
          ],
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual(
          '<><Text fontFamily="Roboto" fontStyle="italic" fontWeight="400" fontSize="16px" textTransform="upper" lineHeight="20px" letterSpacing="20px">a</Text><Text fontFamily="Roboto" fontStyle="italic" fontWeight="700" fontSize="16px" textTransform="upper" lineHeight="20px" letterSpacing="20px">b</Text></>',
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
  describe('Error Node', () => {
    it('should throw error', async () => {
      const element = createElement('TEXT')
      element.node.getCSSAsync = vi.fn().mockRejectedValue({})
      expect(await element.render()).toEqual(
        '<Text error="getCSSAsync Error" />',
      )
    })
  })
  describe('Page', () => {
    it('should remove width props when parent is page', async () => {
      const element = createElement('PAGE' as any, {
        children: [
          createNode('INSTANCE', {
            width: '1920px',
          }),
        ],
      })
      expect(await element.render()).toEqual('<Box>\n  <Box />\n</Box>')
    })
    it('should remove width props when parent is section', async () => {
      const element = createElement('PAGE' as any, {
        children: [
          createNode('INSTANCE', {
            width: '1920px',
          }),
        ],
      })
      expect(await element.render()).toEqual('<Box>\n  <Box />\n</Box>')
    })
  })
  describe('Rectangle', () => {
    it('should render Rectangle', async () => {
      {
        const element = createElement('RECTANGLE', {
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual('<Box />')
      }

      {
        const element = createElement('RECTANGLE', {
          background: 'red',
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual('<Box bg="red" />')
      }
    })
  })
  describe('Position', () => {
    it('should be relative', async () => {
      const element = createElement('FRAME', {
        children: [
          createNode('TEXT', {
            position: 'absolute',
            characters: 'I am centered',
            layoutPositioning: 'ABSOLUTE',
          }),
        ],
      })
      expect(await element.render()).toEqual(
        '<Box position="relative">\n  <Text pos="absolute">\n    I am centered\n  </Text>\n</Box>',
      )
    })
  })

  describe('Render', () => {
    it('should remove width when parent is HUG', async () => {
      const element = createElement('FRAME', {
        layoutSizingHorizontal: 'HUG',
        children: [
          createNode('INSTANCE', {
            width: '1920px',
          }),
        ],
      })
      expect(await element.render()).toEqual('<Box>\n  <Box />\n</Box>')
    })
  })
})
