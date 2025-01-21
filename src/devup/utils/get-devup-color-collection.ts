export async function getDevupColorCollection(): Promise<VariableCollection | null> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const collection = collections.find(
    (collection) => collection.name === 'Devup Colors',
  )
  return collection ?? null
}
