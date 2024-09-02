export async function createDevupVariables(): Promise<{
  collection: VariableCollection
  lightModeId: string
  darkModeId: string
}> {
  const varCollections =
    await figma.variables.getLocalVariableCollectionsAsync()
  let devupCollection = varCollections.find(
    (collection) => collection.name === 'Devup',
  )
  if (devupCollection) devupCollection.remove()
  devupCollection = figma.variables.createVariableCollection('Devup')

  const light = devupCollection.addMode('Light')
  const dark = devupCollection.addMode('Dark')

  devupCollection.modes.forEach(
    (mode) =>
      !['Light', 'Dark'].includes(mode.name) &&
      devupCollection.removeMode(mode.modeId),
  )
  return {
    collection: devupCollection,
    lightModeId: light,
    darkModeId: dark,
  }
}
