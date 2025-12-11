export async function nodeToJson(node: SceneNode): Promise<SceneNode> {
  const result = await node.exportAsync({
    format: 'JSON_REST_V1',
  })
  return (result as { document: SceneNode }).document
}
