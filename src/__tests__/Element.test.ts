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
    variantProperties,
    ...props
  }: {
    [_: string]: any
    characters?: string
    name?: string
    textStyleId?: string
    children?: SceneNode[]
    layoutPositioning?: string
    styledTextSegments?: any[]
    variantProperties?: Record<string, string>
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
    variantProperties,
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
      it('should render Image when children is single image', async () => {
        // frame, frame, [vector, vector]
        const element = createElement('FRAME', {
          width: '120px',
          height: '120px',
          name: 'image',
          children: [
            createNode('FRAME', {
              width: '120px',
              height: '120px',
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
          '<Box w="100px" h="120px">\n  <Image boxSize="60px" src="/icons/image.svg" />\n</Box>',
        )
      })

      describe('Overlap', async () => {
        it('should render Image with overlap', async () => {
          {
            const element = createElement('FRAME', {
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
              '<Image boxSize="60px" src="/icons/image.svg" />',
            )
          }
          {
            const element = createElement('FRAME', {
              width: '100px',
              height: '120px',
              children: [
                createNode('RECTANGLE', {
                  width: '100px',
                  fills: [],
                  height: '120px',
                  children: [
                    createNode('FRAME', {
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
                    }),
                  ],
                }),
              ],
            })
            expect(await element.getComponentType()).toEqual('Box')
            expect(await element.render()).toEqual(
              '<Box w="100px" h="120px">\n  <Box w="100%" h="120px">\n    <Image boxSize="60px" src="/icons/image.svg" />\n  </Box>\n</Box>',
            )
          }
        })

        it('should render Image with overlap2', async () => {
          {
            const element = createElement('FRAME', {
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
              '<Image boxSize="60px" src="/icons/image.svg" />',
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
  <Text fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">
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
            expect(await element.render())
              .toEqual(`<Flex alignItems="center" gap="20px">
  <svg>
    <path/>
  </svg>
  <Text fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">
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
    <Text fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">
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
                name: 'Instance',
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
  <Instance />
  <Image w="17px" h="28px" src="/images/image.svg" />
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
            '<VStack w="60px">\n  <Image src="/icons/image.svg" aspectRatio="1" boxSize="100%" />\n  <Text fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n    Text\n  </Text>\n</VStack>',
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
              '<Image w="60px" h="68px" src="/images/image.png" />',
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
  <Image src="/images/image.png" aspectRatio="1" boxSize="100%" />
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
      it('should render variant svg mask image', async () => {
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
            ],
          })
          expect(await element.render()).toEqual(
            '<Box boxSize="24px" maskImage="url(/icons/image.svg)" bg="$title" maskSize="contain" maskRepeat="no-repeat" />',
          )
        }
      })
      it('should render variant svg mask image', async () => {
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
                fill: 'var(--title, #1A1A1A)',
              }),
            ],
          })
          expect(await element.render()).toEqual(
            '<Box boxSize="24px" maskImage="url(/icons/image.svg)" bg="$title" maskSize="contain" maskRepeat="no-repeat" />',
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
          expect(await element.render()).toEqual(
            '<Text fontFamily="Roboto" fontStyle="italic" fontWeight="400" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n  a\n</Text>',
          )
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
            '<Text fontFamily="Roboto" lineHeight="30px" fontStyle="italic" fontSize="16px" letterSpacing="20px">\n  a\n</Text>',
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
          '<Text fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n  a\n</Text>',
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
          '<>\n  <Text fontFamily="Roboto" fontStyle="italic" fontWeight="400" fontSize="16px" textTransform="upper" lineHeight="20px" letterSpacing="20px">\n    a\n  </Text>\n  <Text fontFamily="Roboto" fontStyle="italic" fontWeight="700" fontSize="16px" textTransform="upper" lineHeight="20px" letterSpacing="20px">\n    b\n  </Text>\n</>',
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
            '<Text as="ul" my="0px" pl="1.5em" fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n  <li>a</li>\n</Text>',
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
            '<Text as="ol" my="0px" pl="1.5em" fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n  <li>a</li>\n</Text>',
          )
        }
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
          '<Center>\n  <Text fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n    I am centered\n  </Text>\n</Center>',
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
      const element = createElement('TEXT', {
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
          },
        ],
      })
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
    })
  })

  describe('Instance', () => {
    it('should render Instance', async () => {
      const element = createElement('INSTANCE', {
        name: 'Instance',
      })
      expect(await element.render()).toEqual('<Instance />')
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
  return (
    <Box />
  )
}`,
      )

      expect(
        await createElement('COMPONENT', {
          name: 'Component',
          variantProperties: {
            color: 'red',
          },
        }).render(),
      ).toEqual(
        `export interface ComponentProps {
  color: unknown
}
export function Component(props: ComponentProps) {
  return (
    <Box />
  )
}`,
      )
    })
  })
  describe('ComponentSet', () => {
    it('should render ComponentSet', async () => {
      expect(
        await createElement('COMPONENT_SET', {
          name: 'ComponentSet',
          children: [
            createNode('COMPONENT', {
              name: 'Component',
            }),
          ],
        }).render(),
      ).toEqual(
        `export function Component() {
  return (
    <Box />
  )
}`,
      )
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
        '<Box position="relative">\n  <Text pos="absolute" fontFamily="Roboto" fontStyle="italic" fontSize="16px" lineHeight="20px" letterSpacing="20px">\n    I am centered\n  </Text>\n</Box>',
      )
    })
  })

  describe('Render', () => {
    it('should remove width when parent is HUG', async () => {
      const element = createElement('FRAME', {
        layoutSizingHorizontal: 'HUG',
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
        await element.render()
        expect(await element.getAssets()).toEqual({
          'image.svg': expect.any(Function),
        })
      }
      {
        const element = createElement('FRAME', {
          name: 'root',
          width: '100px',
          height: '100px',
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
        await element.render()
        expect(await element.getAssets()).toEqual({
          'image.svg': expect.any(Function),
        })
      }
    })
  })
})
