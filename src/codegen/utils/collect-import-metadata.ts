import type { NodeTree } from '../types'

export interface ImportMetadata {
  devupImports: string[]
  customImports: string[]
  usesKeyframes: boolean
}

const DEVUP_COMPONENT_SET = new Set([
  'Center',
  'VStack',
  'Flex',
  'Grid',
  'Box',
  'Text',
  'Image',
])

function walkValue(
  value: unknown,
  metadata: {
    devupImports: Set<string>
    customImports: Set<string>
    usesKeyframes: boolean
  },
) {
  if (typeof value === 'string') {
    if (value.startsWith('keyframes(')) {
      metadata.usesKeyframes = true
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) walkValue(item, metadata)
    return
  }

  if (typeof value !== 'object' || value === null) return

  if ('__imports' in value) {
    const imports = value as {
      __imports?: ImportMetadata
    }
    if (imports.__imports) {
      for (const name of imports.__imports.devupImports) {
        metadata.devupImports.add(name)
      }
      for (const name of imports.__imports.customImports) {
        metadata.customImports.add(name)
      }
      metadata.usesKeyframes ||= imports.__imports.usesKeyframes
    }
  }

  for (const nestedValue of Object.values(value)) {
    walkValue(nestedValue, metadata)
  }
}

export function collectImportMetadataFromTree(
  tree: NodeTree,
  currentComponentName?: string,
): ImportMetadata {
  const metadata = {
    devupImports: new Set<string>(),
    customImports: new Set<string>(),
    usesKeyframes: false,
  }

  const visit = (node: NodeTree) => {
    if (!node.isSlot) {
      if (DEVUP_COMPONENT_SET.has(node.component)) {
        metadata.devupImports.add(node.component)
      } else if (
        node.component !== currentComponentName &&
        node.component !== 'Fragment'
      ) {
        metadata.customImports.add(node.component)
      }
    }

    walkValue(node.props, metadata)

    for (const child of node.children) {
      visit(child)
    }
  }

  visit(tree)

  return {
    devupImports: [...metadata.devupImports].sort(),
    customImports: [...metadata.customImports].sort(),
    usesKeyframes: metadata.usesKeyframes,
  }
}

export function mergeImportMetadata(
  metadatas: Iterable<ImportMetadata>,
): ImportMetadata {
  const merged = {
    devupImports: new Set<string>(),
    customImports: new Set<string>(),
    usesKeyframes: false,
  }

  for (const metadata of metadatas) {
    for (const name of metadata.devupImports) merged.devupImports.add(name)
    for (const name of metadata.customImports) merged.customImports.add(name)
    merged.usesKeyframes ||= metadata.usesKeyframes
  }

  return {
    devupImports: [...merged.devupImports].sort(),
    customImports: [...merged.customImports].sort(),
    usesKeyframes: merged.usesKeyframes,
  }
}
