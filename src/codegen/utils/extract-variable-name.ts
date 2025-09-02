import { toCamel } from '../../utils/to-camel'

export function extractVariableName(value: string) {
  const match = value.match(/var\(--([\w-]+)/)
  // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain
  return '$' + toCamel(match?.[1].split(',')[0].trim()!)
}
