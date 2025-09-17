export async function nodeToJson(node: SceneNode): Promise<SceneNode> {
  return (
    (await node.exportAsync({
      format: 'JSON_REST_V1',
    })) as any
  ).document
}
