import { describe } from 'vitest'

import { Element } from '../Element'

function createNode(
  type: SceneNode['type'],
  {
    characters,
    children = [],
    textStyleId,
    name,
    fills,
    parent,
    x,
    y,
    layoutPositioning = 'AUTO',
    layoutSizingHorizontal,
    layoutMode,
    constraints,
    styledTextSegments = [],
    variantProperties,
    componentProperties,
    getMainComponentAsync,
    componentPropertyDefinitions = {},
    defaultVariant = {},
    visible = true,
    css,
    maxWidth,
    paddingTop = 0,
    paddingBottom = 0,
    paddingLeft = 0,
    paddingRight = 0,
    counterAxisAlignItems,
    ...props
  }: {
    [_: string]: any
    characters?: string
    name?: string
    componentProperties?: ComponentProperties
    textStyleId?: string
    children?: SceneNode[]
    layoutPositioning?: string
    styledTextSegments?: any[]
    variantProperties?: Record<string, string>
    getMainComponentAsync?: () => Promise<ComponentNode | null>
    componentPropertyDefinitions?: ComponentPropertyDefinitions
    defaultVariant?: Record<string, string>
  } = {},
): SceneNode {
  const ret = {
    type,
    getCSSAsync: async () => css ?? props,
    exportAsync: async () => '<svg>\n<path/>\n</svg>',
    getStyledTextSegments: () => styledTextSegments,
    layoutSizingHorizontal,
    layoutMode,
    constraints,
    x,
    y,
    textStyleId,
    defaultVariant,
    maxWidth,
    parent,
    characters,
    componentPropertyDefinitions,
    visible,
    layoutPositioning,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    counterAxisAlignItems,
    width: props.width ? parseInt(props.width) : undefined,
    height: props.height ? parseInt(props.height) : undefined,
    name,
    fills,
    variantProperties,
    children: children,
    componentProperties,
    getMainComponentAsync: getMainComponentAsync ?? (async () => null),
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
        expect(await element.render()).toEqual('<Box borderRadius="50%" />')
        expect(await element.getProps()).toEqual({})
      }
      {
        const element = createElement('ELLIPSE', {
          fill: 'red',
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box bg="red" borderRadius="50%" />',
        )
      }
    })

    it('Box', async () => {
      const outer = createNode('RECTANGLE', {
        width: '60px',
        fills: [],
        layoutMode: 'HORIZONTAL',
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
      {
        const element = createElement('RECTANGLE', {
          border: 'solid 1px rgba(0, 0, 0, 0.16)',
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box border="solid 1px #00000029" />',
        )
      }
      {
        const element = createElement('RECTANGLE', {
          border: 'solid 1px rgba(0, 0, 0, 1)',
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box border="solid 1px #000" />',
        )
      }

      {
        const element = createElement('RECTANGLE', {
          border: 'solid 1px rgba(0, 0, 0, 0.20)',
          fills: [],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box border="solid 1px #0003" />',
        )
      }
    })

    describe('Image', () => {
      it('should render Image when children is single image', async () => {
        // frame, frame, [vector, vector]
        const element = createElement('FRAME', {
          width: '120px',
          height: '120px',
          name: 'image',
          layoutMode: 'HORIZONTAL',
          children: [
            createNode('FRAME', {
              width: '120px',
              height: '120px',
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('RECTANGLE', {
                  width: '20px',
                  height: '20px',
                  fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
                }),
                createNode('RECTANGLE', {
                  width: '20px',
                  height: '20px',
                  fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }],
                }),
              ],
            }),
          ],
        })
        expect(await element.getComponentType()).toEqual('Image')
        expect(await element.render()).toEqual(
          '<Image boxSize="120px" src="/icons/image.svg" />',
        )
      })

      it('VECTOR', async () => {
        const element = createElement('VECTOR', {
          name: 'image',
          width: '60px',
          height: '60px',
        })
        expect(await element.getComponentType()).toEqual('Image')
        expect(await element.render()).toEqual(
          '<Image boxSize="60px" src="/icons/image.svg" />',
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
          '<Image boxSize="60px" src="/icons/image.svg" />',
        )
      })

      it('should divide wrapper and icon asset when children is a square', async () => {
        const element = createElement('FRAME', {
          width: '100px',
          height: '120px',
          layoutMode: 'HORIZONTAL',
          children: [
            createNode('VECTOR', {
              name: 'image',
              width: '60px',
              height: '60px',
            }),
          ],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box h="120px" w="100px">\n  <Image boxSize="60px" src="/icons/image.svg" />\n</Box>',
        )
      })

      describe('Overlap', async () => {
        it('should render Image with overlap', async () => {
          {
            const element = createElement('FRAME', {
              name: 'image',
              width: '60px',
              height: '60px',
              layoutMode: 'HORIZONTAL',
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
              '<Image boxSize="60px" src="/icons/image.svg" />',
            )
          }
          {
            const element = createElement('FRAME', {
              width: '100px',
              height: '120px',
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('RECTANGLE', {
                  width: '100px',
                  fills: [],
                  height: '120px',
                  layoutMode: 'HORIZONTAL',
                  children: [
                    createNode('FRAME', {
                      name: 'image',
                      width: '60px',
                      height: '60px',
                      layoutMode: 'HORIZONTAL',
                      children: [
                        createNode('VECTOR', {
                          fills: [],
                        }),
                        createNode('STAR', {
                          fills: [],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Box')
            expect(await element.render()).toEqual(
              '<Box h="120px" w="100px">\n  <Box h="120px" w="100%">\n    <Image boxSize="60px" src="/icons/image.svg" />\n  </Box>\n</Box>',
            )
          }
        })

        it('should render Image with overlap2', async () => {
          {
            const element = createElement('FRAME', {
              name: 'image',
              width: '60px',
              height: '60px',
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('VECTOR', {
                  fills: [],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Image')
            expect(await element.render()).toEqual(
              '<Image boxSize="60px" src="/icons/image.svg" />',
            )
          }
          {
            const element = createElement('FRAME', {
              name: 'image',
              width: '60px',
              height: '60px',
              'flex-shrink': '0',
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('GROUP', {
                  width: '60px',
                  height: '59.691px',
                  'flex-shrink': '0',
                  layoutMode: 'HORIZONTAL',
                  children: [
                    createNode('GROUP', {
                      width: '60px',
                      height: '59.691px',
                      'flex-shrink': '0',
                      filter: 'drop-shadow(0px 3px 6px rgba(0, 0, 0, 0.16))',
                      layoutMode: 'HORIZONTAL',
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
                      layoutMode: 'HORIZONTAL',
                      children: [
                        createNode('GROUP', {
                          width: '44.047px',
                          height: '28.741px',
                          'flex-shrink': '0',
                          layoutMode: 'HORIZONTAL',
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
              '<Image boxSize="60px" src="/icons/image.svg" />',
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
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('GROUP', {
                  display: 'flex',
                  layoutMode: 'HORIZONTAL',
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
                  styledTextSegments: [
                    {
                      characters: 'Text',
                      start: 0,
                      end: 1,
                      fontName: {
                        family: 'Roboto',
                        style: 'Italic',
                      },
                      textDecoration: 'NONE',
                      textCase: 'ORIGINAL',
                      letterSpacing: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      lineHeight: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      fontSize: 16,
                      listOptions: {
                        type: 'NONE',
                      },
                    },
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Flex')
            expect(await element.render()).toEqual(
              `<Flex alignItems="center" gap="20px">
  <Image boxSize="60px" src="/icons/image.svg" />
  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    letterSpacing="20px"
    lineHeight="20px"
  >
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
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('VECTOR', {
                  width: '17.003px',
                  height: '28.741px',
                  'flex-shrink': '0',
                  fill: 'var(--containerBackground, #FFF)',
                }),
                createNode('TEXT', {
                  characters: 'Text',
                  styledTextSegments: [
                    {
                      characters: 'Text',
                      start: 0,
                      end: 1,
                      fontName: {
                        family: 'Roboto',
                        style: 'Italic',
                      },
                      textDecoration: 'NONE',
                      textCase: 'ORIGINAL',
                      letterSpacing: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      lineHeight: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      fontSize: 16,
                      listOptions: {
                        type: 'NONE',
                      },
                    },
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Flex')
            expect(await element.render()).toEqual(
              `<Flex alignItems="center" gap="20px">
  <svg>
    <path/>
  </svg>
  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    letterSpacing="20px"
    lineHeight="20px"
  >
    Text
  </Text>
</Flex>`,
            )
          }

          {
            const element = createElement('FRAME', {
              display: 'flex',
              'align-items': 'center',
              'align-self': 'stretch',
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('VECTOR', {
                  name: 'image',
                  width: '20px',
                  height: '20px',
                  'flex-shrink': '0',
                  fill: '#231815',
                }),
                createNode('GROUP', {
                  layoutMode: 'HORIZONTAL',
                  children: [
                    createNode('TEXT', {
                      characters: 'Text',
                      styledTextSegments: [
                        {
                          characters: 'Text',
                          start: 0,
                          end: 1,
                          fontName: {
                            family: 'Roboto',
                            style: 'Italic',
                          },
                          textDecoration: 'NONE',
                          textCase: 'ORIGINAL',
                          letterSpacing: {
                            value: 20,
                            unit: 'PIXELS',
                          },
                          lineHeight: {
                            value: 20,
                            unit: 'PIXELS',
                          },
                          fontSize: 16,
                          listOptions: {
                            type: 'NONE',
                          },
                        },
                      ],
                    }),
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Flex')
            expect(await element.render()).toEqual(
              `<Flex alignItems="center">
  <Image boxSize="20px" src="/icons/image.svg" />
  <Box>
    <Text
      fontFamily="Roboto"
      fontSize="16px"
      fontStyle="italic"
      letterSpacing="20px"
      lineHeight="20px"
    >
      Text
    </Text>
  </Box>
</Flex>`,
            )
          }
        })
        it('should render Image with aspect ratio', async () => {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '60px',
            'flex-direction': 'column',
            layoutMode: 'HORIZONTAL',
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
                styledTextSegments: [
                  {
                    characters: 'Text',
                    fontName: {
                      family: 'Roboto',
                      style: 'Italic',
                    },
                    textDecoration: 'NONE',
                    textCase: 'ORIGINAL',
                    letterSpacing: {
                      value: 20,
                      unit: 'PIXELS',
                    },
                    lineHeight: {
                      value: 20,
                      unit: 'PIXELS',
                    },
                    fontSize: 16,
                    listOptions: {
                      type: 'NONE',
                    },
                  },
                ],
              }),
            ],
          })
          expect(await element.render()).toEqual(
            `<VStack w="60px">\n  <Image aspectRatio="1" boxSize="100%" src="/icons/image.svg" />\n  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    letterSpacing="20px"
    lineHeight="20px"
  >\n    Text\n  </Text>\n</VStack>`,
          )
        })
      })

      describe('Rectangle', () => {
        it('should render Image with rectangle', async () => {
          {
            const element = createElement('RECTANGLE', {
              name: 'image',
              width: '60px',
              height: '68px',
              fills: [
                {
                  type: 'IMAGE',
                },
              ],
            })
            expect(await element.getComponentType()).toEqual('Image')
            expect(await element.render()).toEqual(
              '<Image h="68px" src="/images/image.png" w="60px" />',
            )
          }
          {
            const element = createElement('FRAME', {
              display: 'flex',
              width: '6px',
              'align-items': 'flex-start',
              'align-self': 'stretch',
              background: 'var(--menuHover, #F6F4FF)',
              layoutMode: 'HORIZONTAL',
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
                  background: 'url(/images/image.png)',
                  fills: [
                    {
                      type: 'IMAGE',
                    },
                  ],
                }),
              ],
            })
            expect(await element.render()).toEqual(
              `<Flex bg="$menuHover" w="6px">
  <Box bg="$third" borderRadius="100px" flex="1" h="318px" />
  <Image aspectRatio="1" boxSize="100%" src="/images/image.png" />
</Flex>`,
            )
          }
        })
        it('should render Rectangle', async () => {
          const element = createElement('FRAME', {
            layoutMode: 'HORIZONTAL',
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
          expect(await element.render()).toEqual(
            `<Flex bg="$menuHover" gap="10px" w="6px">
  <Box bg="$third" borderRadius="100px" flex="1" h="318px" />
  <Box h="6px" w="100%" />
</Flex>`,
          )
        })
      })

      it('should render Flex with single child and justify-content: space-between', async () => {
        const element = createElement('FRAME', {
          display: 'flex',
          'justify-content': 'space-between',
          layoutMode: 'HORIZONTAL',
          fills: [],
          children: [
            createNode('RECTANGLE', {
              width: '6px',
              height: '6px',
              fills: [],
            }),
          ],
        })
        expect(await element.render()).toEqual(
          `<Flex justifyContent="center">
  <Box boxSize="6px" />
</Flex>`,
        )
      })

      it('should render Child with width of Flex if single child and VStack has align-items: center', async () => {
        const element = createElement('FRAME', {
          display: 'flex',
          'align-items': 'center',
          'flex-direction': 'column',
          layoutMode: 'VERTICAL',
          fills: [],
          counterAxisAlignItems: 'CENTER',
          css: {
            'align-items': 'center',
            'flex-direction': 'column',
            display: 'flex',
          },
          children: [
            createNode('RECTANGLE', {
              maxWidth: '1000px',
              fills: [],
              css: {
                'max-width': '1000px',
              },
            }),
          ],
        })
        expect(await element.render()).toEqual(
          `<VStack alignItems="center">
  <Box maxW="1000px" w="100%" />
</VStack>`,
        )
      })

      it('should render Rectangle with multiple fills', async () => {
        const element = createElement('RECTANGLE', {
          width: '6px',
          height: '6px',
          background: 'url(/images/image.png)',
          fills: [
            {
              type: 'SOLID',
              color: {
                r: 1,
                g: 0,
                b: 0,
                a: 1,
              },
            },
            {
              type: 'IMAGE',
            },
          ],
        })
        expect(await element.render()).toEqual(
          '<Box bg="url(/images/image.png)" boxSize="6px" />',
        )
      })
    })

    describe('Svg', () => {
      it('should render variant svg mask image', async () => {
        {
          const element = createElement('FRAME', {
            width: '24px',
            height: '24px',
            name: 'image',
            layoutMode: 'HORIZONTAL',
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
            `<Box
  bg="$title"
  boxSize="24px"
  maskImage="url(/icons/image.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
          )
        }
      })
      it('should render variant svg mask image', async () => {
        {
          const element = createElement('FRAME', {
            width: '24px',
            height: '24px',
            name: 'image',
            layoutMode: 'HORIZONTAL',
            children: [
              createNode('VECTOR', {
                width: '20.001px',
                height: '20px',
                'flex-shrink': '0',
                fill: 'var(--title, #1A1A1A)',
              }),

              createNode('VECTOR', {
                width: '20.001px',
                height: '20px',
                'flex-shrink': '0',
                fill: 'var(--title, #1A1A1A)',
              }),
            ],
          })
          expect(await element.render()).toEqual(
            `<Box
  bg="$title"
  boxSize="24px"
  maskImage="url(/icons/image.svg)"
  maskRepeat="no-repeat"
  maskSize="contain"
/>`,
          )
        }

        {
          const element = createElement('FRAME', {
            width: '24px',
            height: '24px',
            name: 'image',
            children: [
              createNode('VECTOR', {
                width: '20.001px',
                height: '20px',
                'flex-shrink': '0',
                fill: 'var(--title, #1A1A1A)',
              }),

              createNode('VECTOR', {
                width: '20.001px',
                height: '20px',
                'flex-shrink': '0',
                fill: 'var(--text, #1A1A1A)',
              }),
            ],
          })
          expect(await element.render()).toEqual('<svg>\n  <path/>\n</svg>')
        }
        {
          const element = createElement('VECTOR', {
            width: '24px',
            height: '25px',
            name: 'image',
            children: [],
          })
          expect(await element.render()).toEqual(
            '<Image h="25px" src="/images/image.svg" w="24px" />',
          )
        }
      })
    })

    describe('Text', () => {
      it('should render Text', async () => {
        {
          const element = createElement('TEXT', {
            styledTextSegments: [
              {
                fontName: {
                  family: 'Roboto',
                  style: 'Italic',
                },
                characters: 'a',
                fontWeight: 400,
                fontSize: 16,
                textDecoration: 'NONE',
                textCase: 'ORIGINAL',
                letterSpacing: {
                  value: 20,
                  unit: 'PIXELS',
                },
                start: 0,
                lineHeight: {
                  value: 20,
                  unit: 'PIXELS',
                },
                end: 1,
                listOptions: {
                  type: 'NONE',
                },
              },
            ],
          })
          expect(await element.getComponentType()).toEqual('Text')
          expect(await element.render()).toEqual(`<Text
  fontFamily="Roboto"
  fontSize="16px"
  fontStyle="italic"
  fontWeight="400"
  letterSpacing="20px"
  lineHeight="20px"
>
  a
</Text>`)
        }
        {
          const element = createElement('TEXT', {
            fontFamily: '"Roboto"',
            lineHeight: '30px /* 157.895% */',
            styledTextSegments: [
              {
                fontName: {
                  family: 'Roboto',
                  style: 'Italic',
                },
                fontSize: 16,
                lineHeight: {
                  value: 30,
                  unit: 'PIXELS',
                },
                letterSpacing: {
                  value: 20,
                  unit: 'PIXELS',
                },
                textCase: 'ORIGINAL',
                textDecoration: 'NONE',
                characters: 'a',
                start: 0,
                end: 1,
                listOptions: {
                  type: 'NONE',
                },
              },
            ],
          })
          expect(await element.getComponentType()).toEqual('Text')
          expect(await element.render()).toEqual(
            `<Text
  fontFamily="Roboto"
  fontSize="16px"
  fontStyle="italic"
  letterSpacing="20px"
  lineHeight="30px"
>
  a
</Text>`,
          )
        }
      })

      it('should render Text with char', async () => {
        const element = createElement('TEXT', {
          characters: 'a',
          styledTextSegments: [
            {
              characters: 'a',
              start: 0,
              end: 1,
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              fontSize: 16,
              listOptions: {
                type: 'NONE',
              },
            },
          ],
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual(
          `<Text
  fontFamily="Roboto"
  fontSize="16px"
  fontStyle="italic"
  letterSpacing="20px"
  lineHeight="20px"
>
  a
</Text>`,
        )
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
          'font-weight': '400',
          'font-size': '16px',
          textStyleId: '1',
          styledTextSegments: [
            {
              characters: 'a',
              start: 0,
              end: 1,
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              fontSize: 16,
              textStyleId: '1',
              listOptions: {
                type: 'NONE',
              },
            },
          ],
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual(
          '<Text typography="buttonTitle">\n  a\n</Text>',
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
              listOptions: {
                type: 'NONE',
              },
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
              listOptions: {
                type: 'NONE',
              },
            },
          ],
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual(
          `<Text>
  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    fontWeight="400"
    letterSpacing="20px"
    lineHeight="20px"
    textTransform="upper"
  >
    a
  </Text>
  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    fontWeight="700"
    letterSpacing="20px"
    lineHeight="20px"
    textTransform="upper"
  >
    b
  </Text>
</Text>`,
        )
      })
      it('should render Text with list', async () => {
        {
          const element = createElement('TEXT', {
            characters: 'a',
            styledTextSegments: [
              {
                characters: 'a',
                start: 0,
                end: 1,
                fontName: {
                  family: 'Roboto',
                  style: 'Italic',
                },
                textDecoration: 'NONE',
                textCase: 'ORIGINAL',
                letterSpacing: {
                  value: 20,
                  unit: 'PIXELS',
                },
                lineHeight: {
                  value: 20,
                  unit: 'PIXELS',
                },
                fontSize: 16,
                listOptions: {
                  type: 'UNORDERED',
                },
              },
            ],
          })
          expect(await element.getComponentType()).toEqual('Text')
          expect(await element.render()).toEqual(
            `<Text
  as="ul"
  fontFamily="Roboto"
  fontSize="16px"
  fontStyle="italic"
  letterSpacing="20px"
  lineHeight="20px"
  my="0px"
  pl="1.5em"
>
  <li>a</li>
</Text>`,
          )
        }
        {
          const element = createElement('TEXT', {
            characters: 'a',
            styledTextSegments: [
              {
                characters: 'a',
                start: 0,
                end: 1,
                fontName: {
                  family: 'Roboto',
                  style: 'Italic',
                },
                textDecoration: 'NONE',
                textCase: 'ORIGINAL',
                letterSpacing: {
                  value: 20,
                  unit: 'PIXELS',
                },
                lineHeight: {
                  value: 20,
                  unit: 'PIXELS',
                },
                fontSize: 16,
                listOptions: {
                  type: 'ORDERED',
                },
              },
            ],
          })
          expect(await element.getComponentType()).toEqual('Text')
          expect(await element.render()).toEqual(
            `<Text
  as="ol"
  fontFamily="Roboto"
  fontSize="16px"
  fontStyle="italic"
  letterSpacing="20px"
  lineHeight="20px"
  my="0px"
  pl="1.5em"
>
  <li>a</li>
</Text>`,
          )
        }
      })
      it('should render many Text with typography and color', async () => {
        const getStyleByIdAsync = vi
          .fn()
          .mockResolvedValueOnce({
            fontName: {
              family: 'Roboto',
              style: 'Italic',
            },
            name: 'button-title',
          })
          .mockResolvedValueOnce({
            fontName: {
              family: 'Roboto',
              style: 'Bold',
            },
            name: 'button-title-2',
          })
          .mockResolvedValue({
            fontName: {
              family: 'Roboto',
              style: 'Italic',
            },
            name: 'button-title',
          })

        const getVariableByIdAsync = vi.fn().mockResolvedValueOnce({
          name: 'red',
        })

        ;(globalThis as any).figma = {
          getStyleByIdAsync,
          variables: {
            getVariableByIdAsync,
          },
          util: {
            rgba: (color: RGBA) => {
              return {
                r: color.r,
                g: color.g,
                b: color.b,
                a: color.a ?? 1,
              }
            },
          },
        }
        const element = createElement('TEXT', {
          characters: 'a',
          'font-family': 'Roboto',
          'font-style': 'Italic',
          'font-weight': '400',
          'font-size': '16px',
          textStyleId: '1',
          styledTextSegments: [
            {
              characters: 'a ',
              start: 0,
              end: 1,
              textStyleId: '1',
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              fontSize: 16,
              listOptions: {
                type: 'NONE',
              },
              fills: [
                {
                  type: 'SOLID',
                  color: {
                    r: 1,
                    g: 0,
                    b: 0,
                    a: 1,
                  },
                  visible: true,
                },
              ],
            },
            {
              textStyleId: '2',
              characters: 'b',
              start: 0,
              end: 1,
              fontName: {
                family: 'Roboto',
                style: 'Bold',
              },
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              fontSize: 16,
              listOptions: {
                type: 'NONE',
              },
              fills: [
                {
                  type: 'SOLID',
                  color: {
                    r: 1,
                    g: 1,
                    b: 1,
                    a: 1,
                  },
                  visible: true,
                },
              ],
            },
            {
              textStyleId: '1',
              characters: ' c',
              start: 0,
              end: 1,
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              fontSize: 16,
              listOptions: {
                type: 'NONE',
              },
              fills: [
                {
                  type: 'SOLID',
                  color: {
                    r: 1,
                    g: 0,
                    b: 0,
                    a: 1,
                  },
                  visible: true,
                },
              ],
            },
            {
              textStyleId: '1',
              characters: ' d ',
              start: 0,
              end: 1,
              fontName: {
                family: 'Roboto',
                style: 'Italic',
              },
              textDecoration: 'NONE',
              textCase: 'ORIGINAL',
              letterSpacing: {
                value: 20,
                unit: 'PIXELS',
              },
              lineHeight: {
                value: 20,
                unit: 'PIXELS',
              },
              fontSize: 16,
              listOptions: {
                type: 'NONE',
              },
              fills: [
                {
                  type: 'SOLID',
                  color: {
                    r: 1,
                    g: 0,
                    b: 0,
                    a: 1,
                  },
                  boundVariables: {
                    color: {
                      id: '1',
                    },
                  },
                  visible: true,
                },
              ],
            },
          ],
        })
        expect(await element.getComponentType()).toEqual('Text')
        expect(await element.render()).toEqual(
          '<Text color="#F00" typography="buttonTitle">\n  a{" "}\n  <Text color="#FFF" typography="buttonTitle2">\n    b\n  </Text>\n  {" "}c\n  <Text color="$red">\n    {" "}d{" "}\n  </Text>\n</Text>',
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
        {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '100px',
            height: '100px',
            fills: [],
            'justify-content': 'center',
            layoutMode: 'HORIZONTAL',
            children: [
              createNode('RECTANGLE', {
                width: '100px',
                height: '100px',
                fills: [],
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('Flex')
          expect(await element.render()).toEqual(
            '<Flex boxSize="100px">\n  <Box h="100px" w="100%" />\n</Flex>',
          )
        }

        {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '100px',
            height: '100px',
            fills: [],
            'justify-content': 'center',
            layoutMode: 'HORIZONTAL',
            children: [
              createNode('RECTANGLE', {
                width: '80px',
                height: '100px',
                fills: [],
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('Flex')
          expect(await element.render()).toEqual(
            '<Flex boxSize="100px" justifyContent="center">\n  <Box h="100px" w="80px" />\n</Flex>',
          )
        }
        {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '100px',
            height: '100px',
            fills: [],
            'align-items': 'center',
            layoutMode: 'HORIZONTAL',
            children: [
              createNode('RECTANGLE', {
                width: '100px',
                height: '80px',
                fills: [],
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('Flex')
          expect(await element.render()).toEqual(
            '<Flex alignItems="center" boxSize="100px">\n  <Box h="80px" w="100%" />\n</Flex>',
          )
        }

        {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '100px',
            height: '100px',
            fills: [],
            'justify-content': 'center',
            'flex-direction': 'column',
            layoutMode: 'VERTICAL',
            children: [
              createNode('RECTANGLE', {
                width: '100px',
                height: '80px',
                fills: [],
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('VStack')
          expect(await element.render()).toEqual(
            '<VStack boxSize="100px" justifyContent="center">\n  <Box h="80px" w="100%" />\n</VStack>',
          )
        }
        {
          const element = createElement('FRAME', {
            display: 'flex',
            width: '100px',
            height: '100px',
            fills: [],
            'align-items': 'center',
            layoutMode: 'VERTICAL',
            'flex-direction': 'column',
            children: [
              createNode('RECTANGLE', {
                width: '80px',
                height: '100px',
                fills: [],
              }),
            ],
          })
          expect(await element.getComponentType()).toEqual('VStack')
          expect(await element.render()).toEqual(
            '<VStack alignItems="center" boxSize="100px">\n  <Box h="100px" w="80px" />\n</VStack>',
          )
        }
      })
    })
    describe('Center', () => {
      it('should render Center', async () => {
        const element = createElement('FRAME', {
          layoutMode: 'HORIZONTAL',
          children: [
            createNode('TEXT', {
              characters: 'I am centered',
              styledTextSegments: [
                {
                  characters: 'I am centered',
                  start: 0,
                  end: 1,
                  fontName: {
                    family: 'Roboto',
                    style: 'Italic',
                  },
                  textDecoration: 'NONE',
                  textCase: 'ORIGINAL',
                  letterSpacing: {
                    value: 20,
                    unit: 'PIXELS',
                  },
                  lineHeight: {
                    value: 20,
                    unit: 'PIXELS',
                  },
                  fontSize: 16,
                  listOptions: {
                    type: 'NONE',
                  },
                },
              ],
            }),
          ],
          'align-items': 'center',
          'justify-content': 'center',
          display: 'flex',
        })
        expect(await element.getComponentType()).toEqual('Center')
        expect(await element.render()).toEqual(
          `<Center>
  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    letterSpacing="20px"
    lineHeight="20px"
  >
    I am centered
  </Text>
</Center>`,
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

  describe('Page', () => {
    it('should remove width props when parent is page', async () => {
      const element = createElement('PAGE' as any, {
        layoutMode: 'HORIZONTAL',
        children: [
          createNode('FRAME', {
            width: '1920px',
            name: 'instance',
          }),
        ],
      })
      expect(await element.render()).toEqual('<Box>\n  <Box />\n</Box>')
    })
    it('should remove width props when parent is section', async () => {
      const element = createElement('PAGE' as any, {
        layoutMode: 'HORIZONTAL',
        children: [
          createNode('FRAME', {
            width: '1920px',
            name: 'instance',
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
      {
        const element = createElement('RECTANGLE', {
          width: '1px',
          height: '10px',
          fills: [],
          css: { height: '10px' },
        })
        expect(await element.render()).toEqual('<Box h="10px" w="1px" />')
      }
      {
        const element = createElement('RECTANGLE', {
          height: '10px',
          fills: [],
          css: {
            height: '10px',
            width: 'var(--width, 10px)',
            '-webkit-width': '10px',
          },
        })
        expect(await element.render()).toEqual(
          '<Box h="10px" w="10px" WebkitWidth="10px" />',
        )
      }
    })
  })

  describe('Absolute Position', () => {
    it('should render Absolute Position', async () => {
      {
        const element = createElement('FRAME', {
          fills: [],
          width: '100px',
          height: '100px',
          children: [
            createNode('RECTANGLE', {
              fills: [],
              width: '50px',
              height: '50px',
              x: 25,
              y: 25,
              constraints: {
                horizontal: 'MIN',
                vertical: 'MIN',
              },
            }),
          ],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box boxSize="100px" pos="relative">\n  <Box boxSize="50px" left="25px" pos="absolute" top="25px" />\n</Box>',
        )
      }
      {
        const element = createElement('FRAME', {
          fills: [],
          width: '100px',
          height: '100px',
          children: [
            createNode('RECTANGLE', {
              fills: [],
              width: '50px',
              height: '50px',
              x: 25,
              y: 25,
              constraints: {
                horizontal: 'MAX',
                vertical: 'MAX',
              },
            }),
          ],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box boxSize="100px" pos="relative">\n  <Box bottom="75px" boxSize="50px" pos="absolute" right="75px" />\n</Box>',
        )
      }
      {
        const element = createElement('FRAME', {
          fills: [],
          width: '100px',
          height: '100px',
          children: [
            createNode('RECTANGLE', {
              fills: [],
              width: '50px',
              height: '50px',
              x: 25,
              y: 25,
              constraints: {
                horizontal: 'STRETCH',
                vertical: 'STRETCH',
              },
            }),
          ],
        })
        expect(await element.getComponentType()).toEqual('Box')
        expect(await element.render()).toEqual(
          '<Box boxSize="100px" pos="relative">\n  <Box\n    bottom="0"\n    boxSize="50px"\n    left="0"\n    pos="absolute"\n    right="0"\n    top="0"\n  />\n</Box>',
        )
      }
    })
  })

  describe('Instance', () => {
    it('should render Instance', async () => {
      {
        const element = createElement('INSTANCE', {
          name: 'Instance',
          componentProperties: {},
        })
        expect(await element.render()).toEqual('<Instance />')
      }
      {
        const element = createElement('INSTANCE', {
          name: 'Instance',
          componentProperties: {
            children: { type: 'TEXT', value: 'Hello' },
          },
        })
        expect(await element.render()).toEqual('<Instance>Hello</Instance>')
      }
      {
        const element = createElement('INSTANCE', {
          name: 'Instance',
          componentProperties: {
            children: { type: 'TEXT', value: 'Hello' },
            color: { type: 'TEXT', value: 'red' },
            width: { type: 'TEXT', value: '100px' },
            height: { type: 'TEXT', value: '100px' },
            danger: { type: 'BOOLEAN', value: true },
          },
        })
        expect(await element.render()).toEqual(
          '<Instance color="red" danger height="100px" width="100px">\n  Hello\n</Instance>',
        )
      }
      {
        const element = createElement('INSTANCE', {
          name: 'Instance',
          componentProperties: {
            children: { type: 'TEXT', value: 'Hello' },
            color: { type: 'TEXT', value: 'red' },
            width: { type: 'TEXT', value: '100px' },
            height: { type: 'TEXT', value: '100px' },
            danger: { type: 'BOOLEAN', value: true },
          },
          getMainComponentAsync: async () =>
            createNode('COMPONENT', {
              name: 'MainComponent',
              children: [],
            }),
        })
        expect(await element.render()).toEqual(
          `<Instance color="red" danger height="100px" width="100px">
  Hello
</Instance>

/*
export function MainComponent() {
  return <Box />
}
*/`,
        )
      }
    })
    it('should render Instance with children', async () => {
      const element = createElement('INSTANCE', {
        name: 'MyInstance',
        componentProperties: {
          children: { type: 'TEXT', value: 'Hello' },
        },
      })
      expect(await element.render()).toEqual('<MyInstance>Hello</MyInstance>')
    })

    it('should render Instance with children and many props', async () => {
      const element = createElement('INSTANCE', {
        name: 'MyInstance',
        componentProperties: {
          children: { type: 'TEXT', value: 'Hello' },
          color: { type: 'TEXT', value: 'red' },
          width: { type: 'TEXT', value: '100px' },
          height: { type: 'TEXT', value: '100px' },
          danger: { type: 'BOOLEAN', value: true },
          text: { type: 'TEXT', value: 'hello' },
          text2: { type: 'TEXT', value: 'hello' },
          node: { type: 'INSTANCE_SWAP' },
        },
      })
      expect(await element.render()).toEqual(
        `<MyInstance
  color="red"
  danger
  height="100px"
  node={<Instance />}
  text="hello"
  text2="hello"
  width="100px"
>
  Hello
</MyInstance>`,
      )
    })
    it('should render Instance with interface', async () => {
      const componentSet = createElement('COMPONENT_SET', {
        name: 'MyInstance',
        componentPropertyDefinitions: {
          type: { type: 'VARIANT', value: 'Hello', variantOptions: ['Hello'] },
        },
        defaultVariant: createNode('COMPONENT', {
          name: 'MyInstance',
          variantProperties: {
            type: 'Hello',
          },
        }),
      })
      ;(componentSet.node as any).defaultVariant.parent = componentSet.node
      const element = createElement('INSTANCE', {
        name: 'MyInstance',
        getMainComponentAsync: async () =>
          (componentSet.node as any).defaultVariant,
        componentProperties: {
          type: { type: 'VARIANT', value: 'hello' },
        },
      })
      expect(await element.render()).toEqual(`<MyInstance type="hello" />

/*
export interface MyInstanceProps {
  type: 'hello'
}

export function MyInstance({ type = "hello" }: MyInstanceProps) {
  return <Box />
}
*/`)
    })
  })

  describe('Component', () => {
    it('should render Component', async () => {
      expect(
        await createElement('COMPONENT', {
          name: 'Component',
        }).render(),
      ).toEqual(
        `export function Component() {
  return <Box />
}`,
      )
      const el = await createElement('COMPONENT_SET', {
        name: 'Component',
        componentPropertyDefinitions: {
          children: { type: 'TEXT', value: 'Hello' },
          color: { type: 'TEXT', value: 'red' },
        },
        children: [
          createNode('COMPONENT', {
            name: 'Component',
            variantProperties: {
              color: 'red',
            },
          }),
        ],
      })
      expect(await new Element((el.node as any).children[0]).render()).toEqual(
        `export interface ComponentProps {
  children: React.ReactNode
  color: string
}

export function Component({ color = "red" }: ComponentProps) {
  return <Box />
}`,
      )
    })

    it('should render Component with interface and defaultProps', async () => {
      const el = await createElement('COMPONENT_SET', {
        name: 'Component',
        componentPropertyDefinitions: {
          children: { type: 'TEXT', value: 'Hello' },
          color: { type: 'TEXT', value: 'red' },
        },
        defaultVariant: createNode('COMPONENT', {
          name: 'Component',
          variantProperties: {
            color: 'red',
          },
        }),
        children: [
          createNode('COMPONENT', {
            name: 'Component',
            variantProperties: {
              color: 'red',
            },
          }),
        ],
      })
      // COMPONENT_SET 바로 아래의 COMPONENT를 렌더링하고, default value가 걸려 있는지 확인
      expect(await new Element((el.node as any).children[0]).render()).toEqual(
        `export interface ComponentProps {
  children: React.ReactNode
  color: string
}

export function Component({ color = "red" }: ComponentProps) {
  return <Box />
}`,
      )
    })
  })
  describe('ComponentSet', () => {
    it('should render ComponentSet', async () => {
      {
        expect(
          await createElement('COMPONENT_SET', {
            name: 'Component',
            componentPropertyDefinitions: {},
            defaultVariant: createNode('COMPONENT', {
              name: 'Component',
            }),
            children: [
              createNode('COMPONENT', {
                name: 'Component',
              }),
            ],
          }).render(),
        ).toEqual(
          `export function Component() {
  return <Box />
}`,
        )
      }
      {
        expect(
          await createElement('COMPONENT_SET', {
            name: 'Component',
            componentPropertyDefinitions: {
              type: {
                type: 'VARIANT',
                value: 'Hello',
                variantOptions: undefined,
              },
            },
            defaultVariant: createNode('COMPONENT', {
              name: 'Component',
            }),
            children: [
              createNode('COMPONENT', {
                name: 'Component',
              }),
            ],
          }).render(),
        ).toEqual(
          `export interface ComponentProps {
  type: string
}

export function Component(props: ComponentProps) {
  return <Box />
}`,
        )
      }
    })
    it('should render ComponentSet with interface', async () => {
      expect(
        await createElement('COMPONENT_SET', {
          name: 'Component',
          componentPropertyDefinitions: {
            children: { type: 'TEXT', value: 'Hello' },
            text: {
              type: 'VARIANT',
              value: 'Hello',
              variantOptions: ['Hello', 'World'],
            },
            color: { type: 'BOOLEAN', defaultValue: true },
            node: { type: 'INSTANCE_SWAP' },
          },
          defaultVariant: createNode('COMPONENT', {
            name: 'Component',
          }),
          children: [
            createNode('COMPONENT', {
              name: 'Component',
            }),
          ],
        }).render(),
      ).toEqual(`export interface ComponentProps {
  children: React.ReactNode
  text: 'hello' | 'world'
  color?: boolean
  node: React.ReactNode
}

export function Component(props: ComponentProps) {
  return <Box />
}`)
    })

    it('should render componentSet with effect', async () => {
      {
        const el = await createElement('COMPONENT_SET', {
          name: 'ComponentSet',
          componentPropertyDefinitions: {
            effect: {
              type: 'VARIANT',
              value: 'default',
              variantOptions: ['default', 'hover', 'active'],
            },
            text: {
              type: 'VARIANT',
              value: 'Hello',
              variantOptions: ['Hello', 'World'],
            },
          },
          children: [
            createNode('COMPONENT', {
              color: 'red',
              name: 'ComponentSet',
              variantProperties: {
                effect: 'default',
                text: 'Hello',
              },
            }),
            createNode('COMPONENT', {
              bg: 'red',
              color: 'red',
              name: 'ComponentSet',
              variantProperties: {
                effect: 'hover',
                text: 'Hello',
              },
            }),
            createNode('COMPONENT', {
              bg: 'blue',
              color: 'green',
              name: 'ComponentSet',
              variantProperties: {
                effect: 'active',
                text: 'Hello',
              },
            }),
          ],
        })
        ;(el.node as any).defaultVariant = (el.node as any).children[0]
        expect(await new Element(el.node as any).render()).toEqual(
          `export interface ComponentSetProps {
  text: 'hello' | 'world'
}

export function ComponentSet(props: ComponentSetProps) {
  return (
    <Box
      _active={{
        "bg": "blue",
        "color": "green"
      }}
      _hover={{
        "bg": "red"
      }}
      color="red"
    />
  )
}`,
        )
      }
      {
        const el = await createElement('COMPONENT_SET', {
          name: 'ComponentSet',
          componentPropertyDefinitions: {
            effect: {
              type: 'VARIANT',
              value: 'default',
              variantOptions: ['default', 'hover', 'active'],
            },
            text: {
              type: 'VARIANT',
              value: 'Hello',
              variantOptions: ['Hello', 'World'],
            },
          },
          children: [
            createNode('COMPONENT', {
              color: 'red',
              name: 'ComponentSet',
              variantProperties: {
                effect: 'default',
                text: 'Hello',
              },
              children: [
                createNode('TEXT', {
                  characters: 'Hello',
                  color: 'blue',
                  styledTextSegments: [
                    {
                      characters: 'Hello',
                      start: 0,
                      end: 1,
                      fontName: {
                        family: 'Roboto',
                        style: 'Italic',
                      },
                      textDecoration: 'NONE',
                      textCase: 'ORIGINAL',
                      letterSpacing: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      lineHeight: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      fontSize: 16,
                      listOptions: {
                        type: 'NONE',
                      },
                    },
                  ],
                }),
              ],
            }),
            createNode('COMPONENT', {
              bg: 'red',
              color: 'red',
              name: 'ComponentSet',
              variantProperties: {
                effect: 'hover',
                text: 'Hello',
              },
              children: [
                createNode('TEXT', {
                  characters: 'Hello',
                  styledTextSegments: [
                    {
                      characters: 'Hello',
                      start: 0,
                      end: 1,
                      fontName: {
                        family: 'Roboto',
                        style: 'Italic',
                      },
                      textDecoration: 'NONE',
                      textCase: 'ORIGINAL',
                      letterSpacing: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      lineHeight: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      fontSize: 16,
                      listOptions: {
                        type: 'NONE',
                      },
                    },
                  ],
                }),
              ],
            }),
            createNode('COMPONENT', {
              bg: 'blue',
              color: 'green',
              name: 'ComponentSet',
              variantProperties: {
                effect: 'active',
                text: 'Hello',
              },
              layoutMode: 'HORIZONTAL',
              children: [
                createNode('TEXT', {
                  characters: 'Hello',
                  styledTextSegments: [
                    {
                      characters: 'Hello',
                      start: 0,
                      end: 1,
                      fontName: {
                        family: 'Roboto',
                        style: 'Italic',
                      },
                      textDecoration: 'NONE',
                      textCase: 'ORIGINAL',
                      letterSpacing: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      lineHeight: {
                        value: 20,
                        unit: 'PIXELS',
                      },
                      fontSize: 16,
                      listOptions: {
                        type: 'NONE',
                      },
                    },
                  ],
                }),
              ],
            }),
          ],
        })
        ;(el.node as any).defaultVariant = (el.node as any).children[0]
        expect(await new Element(el.node as any).render())
          .toEqual(`export interface ComponentSetProps {
  text: 'hello' | 'world'
}

export function ComponentSet(props: ComponentSetProps) {
  return (
    <Box
      _active={{
        "bg": "blue",
        "color": "green"
      }}
      _hover={{
        "bg": "red"
      }}
      color="red"
    >
      <Text
        fontFamily="Roboto"
        fontSize="16px"
        fontStyle="italic"
        letterSpacing="20px"
        lineHeight="20px"
      >
        Hello
      </Text>
    </Box>
  )
}`)
      }
    })
    it('should render empty componentSet', async () => {
      const el = await createElement('COMPONENT_SET', {
        name: 'ComponentSet',
        componentPropertyDefinitions: {},
      })
      expect(await new Element(el.node as any).render()).toEqual('')
    })
    it('should render componentSet with effect and other props', async () => {
      const el = await createElement('COMPONENT_SET', {
        name: 'ComponentSet',
        componentPropertyDefinitions: {
          effect: {
            type: 'VARIANT',
            value: 'default',
            variantOptions: ['default', 'hover', 'active'],
          },
          type: {
            type: 'VARIANT',
            value: 'button',
            variantOptions: ['button', 'input'],
          },
        },
        children: [
          createNode('COMPONENT', {
            name: 'ComponentSet',
            variantProperties: {
              effect: 'default',
              type: 'button',
            },
            children: [
              createNode('TEXT', {
                characters: 'button',
              }),
            ],
          }),
          createNode('COMPONENT', {
            name: 'ComponentSet',
            variantProperties: {
              effect: 'hover',
              type: 'input',
            },
            children: [
              createNode('TEXT', {
                characters: 'button',
              }),
            ],
          }),
        ],
      })
      ;(el.node as any).defaultVariant = (el.node as any).children[0]
      expect(await new Element(el.node as any).render())
        .toEqual(`export interface ComponentSetProps {
  type: 'button' | 'input'
}

export function ComponentSet(props: ComponentSetProps) {
  return (
    <Box>
      <Text />
    </Box>
  )
}`)
    })
  })

  describe('Position', () => {
    it('should be relative', async () => {
      const element = createElement('FRAME', {
        children: [
          createNode('TEXT', {
            position: 'absolute',
            characters: 'I am centered',
            x: 0,
            y: 0,
            layoutPositioning: 'ABSOLUTE',
            constraints: {
              horizontal: 'MIN',
              vertical: 'MIN',
            },
            styledTextSegments: [
              {
                characters: 'I am centered',
                start: 0,
                end: 1,
                fontName: {
                  family: 'Roboto',
                  style: 'Italic',
                },
                textDecoration: 'NONE',
                textCase: 'ORIGINAL',
                letterSpacing: {
                  value: 20,
                  unit: 'PIXELS',
                },
                lineHeight: {
                  value: 20,
                  unit: 'PIXELS',
                },
                fontSize: 16,
                listOptions: {
                  type: 'NONE',
                },
              },
            ],
          }),
        ],
      })
      expect(await element.render()).toEqual(
        `<Box pos="relative">
  <Text
    fontFamily="Roboto"
    fontSize="16px"
    fontStyle="italic"
    left="0"
    letterSpacing="20px"
    lineHeight="20px"
    pos="absolute"
    top="0"
  >
    I am centered
  </Text>
</Box>`,
      )
    })
  })

  describe('Render', () => {
    it('should remove width when parent is HUG', async () => {
      const element = createElement('FRAME', {
        layoutSizingHorizontal: 'HUG',
        layoutMode: 'HORIZONTAL',
        children: [
          createNode('FRAME', {
            width: '1920px',
            name: 'instance',
          }),
        ],
      })
      expect(await element.render()).toEqual('<Box>\n  <Box />\n</Box>')
    })
  })
  describe('Assets', () => {
    it('should render Assets', async () => {
      {
        const element = createElement('FRAME', {
          name: 'image',
          children: [
            createNode('VECTOR', {
              name: 'image',
              width: 100,
              height: 100,
            }),
          ],
        })
        await element.run()
        expect(await element.getAssets()).toEqual({
          'image.svg': expect.any(Function),
        })
      }
      {
        const element = createElement('FRAME', {
          name: 'root',
          width: '100px',
          height: '100px',
          layoutMode: 'HORIZONTAL',
          children: [
            createNode('TEXT', {
              width: '100px',
              height: '100px',
              name: 'text',
              characters: 'Text',
              styledTextSegments: [
                {
                  characters: 'Text',
                  start: 0,
                  end: 1,
                  fontName: {
                    family: 'Roboto',
                    style: 'Italic',
                  },
                  textDecoration: 'NONE',
                  textCase: 'ORIGINAL',
                  letterSpacing: {
                    value: 20,
                    unit: 'PIXELS',
                  },
                  lineHeight: {
                    value: 20,
                    unit: 'PIXELS',
                  },
                  fontSize: 16,
                  listOptions: {
                    type: 'NONE',
                  },
                },
              ],
            }),
            createNode('VECTOR', {
              name: 'image',
              width: '100px',
              height: '100px',
            }),
          ],
        })
        await element.run()
        expect(await element.getAssets()).toEqual({
          'image.svg': expect.any(Function),
          'image_0.svg': expect.any(Function),
        })
      }
    })
  })
})
