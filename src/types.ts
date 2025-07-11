export interface ComponentProps {
  [key: string]: ComponentPropValue
}

export interface ComponentPropValue {
  type: string
  optional: boolean
  defaultValue: string | boolean
}

export type ComponentType =
  | 'Fragment'
  | 'Box'
  | 'Text'
  | 'Button'
  | 'Input'
  | 'Flex'
  | 'VStack'
  | 'Center'
  | 'Image'
  | 'Grid'
  | 'svg'

export const InstanceSymbol = Symbol('Instance')

export interface DevupNodeProps {
  [key: string]: string | boolean | DevupNodeProps | symbol
}

export interface DevupElement {
  children: DevupNode[]
  props: DevupNodeProps
  componentType: ComponentType | (string & {})
}

export type DevupNode = DevupElement | string
