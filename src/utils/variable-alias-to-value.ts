export async function variableAliasToValue(
  value: VariableAlias,
  modeId: string,
): Promise<Exclude<VariableValue, VariableAlias> | null> {
  const variable = await figma.variables.getVariableByIdAsync(value.id)
  if (variable === null) return null
  const retValue = variable.valuesByMode[modeId]
  if (
    typeof retValue === 'object' &&
    'type' in retValue &&
    retValue.type === 'VARIABLE_ALIAS'
  )
    return variableAliasToValue(retValue, modeId)
  return retValue as Exclude<VariableValue, VariableAlias> | null
}
