import { toCamel } from './to-camel'

type VariableBindableTextField =
  | 'fontFamily'
  | 'fontSize'
  | 'fontStyle'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
  | 'paragraphSpacing'
  | 'paragraphIndent'

type TextStyleBoundVariables = {
  [field in VariableBindableTextField]?: VariableAlias
}

export async function resolveTextStyleBoundVariable(
  boundVariables: TextStyleBoundVariables | undefined,
  field: VariableBindableTextField,
): Promise<string | null> {
  const binding = boundVariables?.[field]
  if (!binding) return null
  const variable = await figma.variables.getVariableByIdAsync(binding.id)
  if (variable?.name) return `$${toCamel(variable.name)}`
  return null
}
