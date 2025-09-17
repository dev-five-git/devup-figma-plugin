export function getObjectFitProps(
  node: SceneNode,
): Record<string, boolean | string | number | undefined | null> | undefined {
  if (
    node.isAsset &&
    'fills' in node &&
    Array.isArray(node.fills) &&
    node.fills.length > 0
  ) {
    const bgImage: ImagePaint | undefined = node.fills.find(
      (fill: Paint) => fill.type === 'IMAGE' && !!fill.visible,
    )
    if (bgImage)
      return {
        objectFit: {
          FILL: null,
          FIT: 'contain',
          CROP: 'cover',
          TILE: null,
        }[bgImage.scaleMode],
      }
  }
}
