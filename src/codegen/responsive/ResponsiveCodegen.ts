import { Codegen } from '../Codegen'
import {
  getSelectorPropsForGroup,
  sanitizePropertyName,
} from '../props/selector'
import { renderComponent, renderNode } from '../render'
import type { NodeTree, Props } from '../types'
import { paddingLeftMultiline } from '../utils/padding-left-multiline'
import { perfEnd, perfStart } from '../utils/perf'
import {
  BREAKPOINT_ORDER,
  type BreakpointKey,
  createVariantPropValue,
  getBreakpointByWidth,
  isEqual,
  mergePropsToResponsive,
  mergePropsToVariant,
  optimizeResponsiveValue,
  type PropValue,
  viewportToBreakpoint,
} from '.'

const POSITION_PROP_KEYS = new Set([
  'pos',
  'top',
  'left',
  'right',
  'bottom',
  'display',
])
const RESERVED_VARIANT_KEYS = new Set(['effect', 'viewport'])

function firstMapValue<V>(map: Map<unknown, V>): V {
  for (const v of map.values()) return v
  throw new Error('empty map')
}

function firstMapEntry<K, V>(map: Map<K, V>): [K, V] {
  for (const entry of map.entries()) return entry
  throw new Error('empty map')
}

/**
 * Build a stable merged order of child names across multiple variants/breakpoints.
 * Uses topological sort on a DAG of ordering constraints from all variants,
 * with average-position tie-breaking for deterministic output.
 *
 * Example: variant A has [Icon, TextA, Arrow], variant B has [Icon, TextB, Arrow]
 * → edges: Icon→TextA, TextA→Arrow, Icon→TextB, TextB→Arrow
 * → topo sort: [Icon, TextA, TextB, Arrow] (Arrow stays last)
 */
function mergeChildNameOrder(
  childrenMaps: Map<unknown, Map<string, NodeTree[]>>,
): string[] {
  // Collect distinct child name sequences from each variant
  const sequences: string[][] = []
  for (const childMap of childrenMaps.values()) {
    const seq: string[] = []
    for (const name of childMap.keys()) {
      seq.push(name)
    }
    sequences.push(seq)
  }

  // Collect all unique names
  const allNames = new Set<string>()
  for (const seq of sequences) {
    for (const name of seq) {
      allNames.add(name)
    }
  }

  if (allNames.size === 0) return []
  if (allNames.size === 1) return [...allNames]

  // Build DAG: for each variant, add edge from consecutive distinct names
  const edges = new Map<string, Set<string>>()
  const inDegree = new Map<string, number>()
  for (const name of allNames) {
    edges.set(name, new Set())
    inDegree.set(name, 0)
  }

  for (const seq of sequences) {
    for (let i = 0; i < seq.length - 1; i++) {
      const from = seq[i]
      const to = seq[i + 1]
      const fromEdges = edges.get(from)
      if (fromEdges && !fromEdges.has(to)) {
        fromEdges.add(to)
        inDegree.set(to, (inDegree.get(to) || 0) + 1)
      }
    }
  }

  // Compute average normalized position for tie-breaking
  const avgPosition = new Map<string, number>()
  for (const name of allNames) {
    let totalPos = 0
    let count = 0
    for (const seq of sequences) {
      const idx = seq.indexOf(name)
      if (idx >= 0) {
        // Normalize to 0..1 range
        totalPos += seq.length > 1 ? idx / (seq.length - 1) : 0.5
        count++
      }
    }
    avgPosition.set(name, count > 0 ? totalPos / count : 0.5)
  }

  // Kahn's algorithm with priority-based tie-breaking
  const queue: string[] = []
  for (const [name, deg] of inDegree) {
    if (deg === 0) queue.push(name)
  }
  // Sort initial queue by average position (stable)
  queue.sort((a, b) => (avgPosition.get(a) || 0) - (avgPosition.get(b) || 0))

  const result: string[] = []
  while (queue.length > 0) {
    const node = queue.shift()
    if (!node) break
    result.push(node)
    for (const neighbor of edges.get(node) || []) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) {
        queue.push(neighbor)
        // Re-sort to maintain priority order
        queue.sort(
          (a, b) => (avgPosition.get(a) || 0) - (avgPosition.get(b) || 0),
        )
      }
    }
  }

  // Cycle fallback: append any remaining nodes (shouldn't happen with consistent data)
  if (result.length < allNames.size) {
    for (const name of allNames) {
      if (!result.includes(name)) {
        result.push(name)
      }
    }
  }

  return result
}

/**
 * Generate responsive code by merging children inside a Section.
 * Uses Codegen to build NodeTree for each breakpoint, then merges them.
 */
export class ResponsiveCodegen {
  private breakpointNodes: Map<BreakpointKey, SceneNode> = new Map()

  constructor(private sectionNode: SectionNode | null) {
    if (this.sectionNode) {
      this.categorizeChildren()
    }
  }

  /**
   * Group Section children by width to decide breakpoints.
   */
  private categorizeChildren() {
    if (!this.sectionNode) return
    for (const child of this.sectionNode.children) {
      if ('width' in child) {
        const breakpoint = getBreakpointByWidth(child.width)
        // If multiple nodes share a breakpoint, keep the first.
        if (!this.breakpointNodes.has(breakpoint)) {
          this.breakpointNodes.set(breakpoint, child)
        }
      }
    }
  }

  /**
   * Generate responsive code.
   */
  async generateResponsiveCode(): Promise<string> {
    if (this.breakpointNodes.size === 0) {
      return '// No responsive variants found in section'
    }

    if (this.breakpointNodes.size === 1) {
      // If only one breakpoint, generate normal code using Codegen.
      const [, node] = firstMapEntry(this.breakpointNodes)
      const codegen = new Codegen(node)
      const tree = await codegen.getTree()
      return Codegen.renderTree(tree, 0)
    }

    // Extract trees per breakpoint using Codegen — all independent, run in parallel.
    const breakpointTrees = new Map<BreakpointKey, NodeTree>()
    for (const [bp, node] of this.breakpointNodes) {
      const codegen = new Codegen(node)
      const tree = await codegen.getTree()
      breakpointTrees.set(bp, tree)
    }

    // Merge trees and generate code.
    return this.generateMergedCode(breakpointTrees, 0)
  }

  /**
   * Convert NodeTree children array to Map by nodeName.
   */
  private treeChildrenToMap(tree: NodeTree): Map<string, NodeTree[]> {
    const result = new Map<string, NodeTree[]>()
    for (const child of tree.children) {
      const existing = result.get(child.nodeName) || []
      existing.push(child)
      result.set(child.nodeName, existing)
    }
    return result
  }

  /**
   * Generate merged responsive code from NodeTree objects.
   */
  generateMergedCode(
    treesByBreakpoint: Map<BreakpointKey, NodeTree>,
    depth: number,
  ): string {
    const firstTree = firstMapValue(treesByBreakpoint)

    // If node is INSTANCE or COMPONENT, render as component reference
    if (firstTree.isComponent) {
      // For components, we might still need position props
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        const posProps: Props = {}
        if (tree.props.pos) posProps.pos = tree.props.pos
        if (tree.props.top) posProps.top = tree.props.top
        if (tree.props.left) posProps.left = tree.props.left
        if (tree.props.right) posProps.right = tree.props.right
        if (tree.props.bottom) posProps.bottom = tree.props.bottom
        if (tree.props.display) posProps.display = tree.props.display
        propsMap.set(bp, posProps)
      }
      const mergedPositionProps = mergePropsToResponsive(propsMap)

      // Extract variant props (non-position props) - these are Instance variant values
      // They should be the same across breakpoints, so just use firstTree
      // Filter out reserved variant keys (effect, viewport) which are used internally
      const variantProps: Props = {}
      for (const [key, value] of Object.entries(firstTree.props)) {
        const lowerKey = key.toLowerCase()
        if (
          !POSITION_PROP_KEYS.has(key) &&
          !RESERVED_VARIANT_KEYS.has(lowerKey)
        ) {
          variantProps[key] = value
        }
      }

      // If component has position props, wrap in Box
      if (Object.keys(mergedPositionProps).length > 0) {
        const componentCode = renderNode(
          firstTree.component,
          variantProps,
          0,
          [],
        )
        return renderNode('Box', mergedPositionProps, depth, [componentCode])
      }

      return renderNode(firstTree.component, variantProps, depth, [])
    }

    // Handle WRAPPER nodes (position wrapper for components)
    if (firstTree.nodeType === 'WRAPPER') {
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // Recursively merge the inner component
      const innerTrees = new Map<BreakpointKey, NodeTree>()
      for (const [bp, tree] of treesByBreakpoint) {
        if (tree.children.length > 0) {
          innerTrees.set(bp, tree.children[0])
        }
      }

      const innerCode =
        innerTrees.size > 0 ? this.generateMergedCode(innerTrees, 0) : ''

      return renderNode('Box', mergedProps, depth, innerCode ? [innerCode] : [])
    }

    // Merge props across breakpoints
    const propsMap = new Map<BreakpointKey, Props>()
    for (const [bp, tree] of treesByBreakpoint) {
      propsMap.set(bp, tree.props)
    }
    const mergedProps = mergePropsToResponsive(propsMap)

    // Handle TEXT nodes with textChildren
    if (firstTree.textChildren && firstTree.textChildren.length > 0) {
      // Merge text children across breakpoints
      const mergedTextChildren =
        this.mergeTextChildrenAcrossBreakpoints(treesByBreakpoint)
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        mergedTextChildren,
      )
    }

    // Merge children by name
    const childrenCodes: string[] = []

    // Convert all trees' children to maps
    const childrenMaps = new Map<BreakpointKey, Map<string, NodeTree[]>>()
    for (const [bp, tree] of treesByBreakpoint) {
      childrenMaps.set(bp, this.treeChildrenToMap(tree))
    }

    // Get all child names in stable merged order across all breakpoints
    const allChildNames = mergeChildNameOrder(childrenMaps)

    for (const childName of allChildNames) {
      // Find the maximum number of children with this name across all breakpoints
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      // Process each child index separately
      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByBreakpoint = new Map<BreakpointKey, NodeTree>()
        const presentBreakpoints = new Set<BreakpointKey>()

        for (const [bp, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByBreakpoint.set(bp, children[childIndex])
            presentBreakpoints.add(bp)
          }
        }

        if (childByBreakpoint.size > 0) {
          // Add display:none props for breakpoints where child doesn't exist
          // This handles both:
          // 1. Child exists only in mobile (needs display:none in pc)
          // 2. Child exists only in pc (needs display:none in mobile)
          for (const bp of treesByBreakpoint.keys()) {
            if (!presentBreakpoints.has(bp)) {
              const firstChildTree = firstMapValue(childByBreakpoint)
              const hiddenTree: NodeTree = {
                ...firstChildTree,
                props: { ...firstChildTree.props, display: 'none' },
              }
              childByBreakpoint.set(bp, hiddenTree)
            }
          }

          const childCode = this.generateMergedCode(childByBreakpoint, 0)
          childrenCodes.push(childCode)
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }

  /**
   * Check if node is Section and can generate responsive.
   */
  static canGenerateResponsive(node: SceneNode): node is SectionNode {
    return node.type === 'SECTION'
  }

  /**
   * Return parent Section if exists.
   */
  static hasParentSection(node: SceneNode): SectionNode | null {
    if (node.parent?.type === 'SECTION') {
      return node.parent as SectionNode
    }
    return null
  }

  /**
   * Generate responsive component codes for COMPONENT_SET with viewport variant.
   * Groups components by non-viewport variants and merges viewport variants.
   */
  static async generateViewportResponsiveComponents(
    componentSet: ComponentSetNode,
    componentName: string,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    // Find viewport and effect variant keys
    let viewportKey: string | undefined
    let effectKey: string | undefined
    for (const key in componentSet.componentPropertyDefinitions) {
      const lower = key.toLowerCase()
      if (lower === 'viewport') viewportKey = key
      else if (lower === 'effect') effectKey = key
    }

    if (!viewportKey) {
      return []
    }

    // Get variants excluding viewport
    const variants: Record<string, string> = {}
    for (const name in componentSet.componentPropertyDefinitions) {
      const definition = componentSet.componentPropertyDefinitions[name]
      const lowerName = name.toLowerCase()
      if (lowerName !== 'viewport' && lowerName !== 'effect') {
        const sanitizedName = sanitizePropertyName(name)
        if (definition.type === 'VARIANT') {
          variants[sanitizedName] =
            definition.variantOptions?.map((opt) => `'${opt}'`).join(' | ') ||
            ''
        } else if (definition.type === 'INSTANCE_SWAP') {
          variants[sanitizedName] = 'React.ReactNode'
        } else if (definition.type === 'BOOLEAN') {
          variants[sanitizedName] = 'boolean'
        } else if (definition.type === 'TEXT') {
          variants[sanitizedName] = 'string'
        }
      }
    }

    // Group components by non-viewport, non-effect variants
    const groups = new Map<string, Map<BreakpointKey, ComponentNode>>()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      // Skip non-default effect variants (they become pseudo-selectors)
      if (effectKey && variantProps[effectKey] !== 'default') continue

      const viewportValue = variantProps[viewportKey]
      if (!viewportValue) continue

      const breakpoint = viewportToBreakpoint(viewportValue)
      // Create group key from non-viewport, non-effect variants
      const parts: string[] = []
      for (const key in variantProps) {
        const lowerKey = key.toLowerCase()
        if (lowerKey !== 'viewport' && lowerKey !== 'effect') {
          parts.push(`${key}=${variantProps[key]}`)
        }
      }
      parts.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const groupKey = parts.join('|') || '__default__'

      if (!groups.has(groupKey)) {
        groups.set(groupKey, new Map())
      }
      const group = groups.get(groupKey)
      if (group) {
        group.set(breakpoint, component)
      }
    }

    // Generate responsive code for each group
    const results: Array<readonly [string, string]> = []
    const responsiveCodegen = new ResponsiveCodegen(null)

    for (const [groupKey, viewportComponents] of groups) {
      // Parse group key to get variant filter for getSelectorPropsForGroup
      const variantFilter: Record<string, string> = {}
      if (groupKey !== '__default__') {
        for (const part of groupKey.split('|')) {
          const [key, value] = part.split('=')
          // Exclude effect from filter (we want all effect variants for this group)
          if (key.toLowerCase() !== 'effect') {
            variantFilter[key] = value
          }
        }
      }

      // Build trees for each viewport — all independent, run in parallel.
      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>()
      for (const [bp, component] of viewportComponents) {
        let t = perfStart()
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        perfEnd('Codegen.getTree(viewportVariant)', t)

        // Get pseudo-selector props for this specific variant group AND viewport
        // This ensures hover/active colors are correctly responsive per viewport
        if (effectKey) {
          const viewportValue = component.variantProperties?.[viewportKey]
          t = perfStart()
          const selectorProps = await getSelectorPropsForGroup(
            componentSet,
            variantFilter,
            viewportValue,
          )
          perfEnd('getSelectorPropsForGroup(viewport)', t)
          if (Object.keys(selectorProps).length > 0) {
            tree.props = Object.assign({}, tree.props, selectorProps)
          }
        }

        treesByBreakpoint.set(bp, tree)
      }

      // Generate merged responsive code
      const mergedCode = responsiveCodegen.generateMergedCode(
        treesByBreakpoint,
        0,
      )

      results.push([
        componentName,
        renderComponent(componentName, mergedCode, variants),
      ] as const)
    }

    return results
  }

  /**
   * Generate component code for COMPONENT_SET with viewport AND other variants.
   * First merges by viewport (responsive arrays), then by other variants (conditional objects).
   *
   * Example output for status variant:
   * - Props: w={{ scroll: [1, 2], default: [3, 4] }[status]}
   * - Conditional nodes: {status === "scroll" && <Node/>}
   */
  static async generateVariantResponsiveComponents(
    componentSet: ComponentSetNode,
    componentName: string,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    console.info(
      `[perf] generateVariantResponsiveComponents: ${componentName}, ${componentSet.children.length} children, ${Object.keys(componentSet.componentPropertyDefinitions).length} variant keys`,
    )
    const tTotal = perfStart()

    // Find viewport and effect variant keys
    let viewportKey: string | undefined
    let effectKey: string | undefined
    for (const key in componentSet.componentPropertyDefinitions) {
      const lower = key.toLowerCase()
      if (lower === 'viewport') viewportKey = key
      else if (lower === 'effect') effectKey = key
    }

    // Get all variant keys excluding viewport and effect
    const otherVariantKeys: string[] = []
    const variants: Record<string, string> = {}
    // Map from original name to sanitized name
    const variantKeyToSanitized: Record<string, string> = {}
    for (const name in componentSet.componentPropertyDefinitions) {
      const definition = componentSet.componentPropertyDefinitions[name]
      if (definition.type === 'VARIANT') {
        const lowerName = name.toLowerCase()
        // Exclude both viewport and effect from variant keys
        // viewport is handled by responsive merging
        // effect is handled by getSelectorProps (pseudo-selectors like _hover, _active)
        if (lowerName !== 'viewport' && lowerName !== 'effect') {
          const sanitizedName = sanitizePropertyName(name)
          otherVariantKeys.push(name) // Keep original for Figma data access
          variantKeyToSanitized[name] = sanitizedName
          variants[sanitizedName] =
            definition.variantOptions?.map((opt) => `'${opt}'`).join(' | ') ||
            ''
        }
      } else if (definition.type === 'INSTANCE_SWAP') {
        const sanitizedName = sanitizePropertyName(name)
        variants[sanitizedName] = 'React.ReactNode'
      } else if (definition.type === 'BOOLEAN') {
        const sanitizedName = sanitizePropertyName(name)
        variants[sanitizedName] = 'boolean'
      } else if (definition.type === 'TEXT') {
        const sanitizedName = sanitizePropertyName(name)
        variants[sanitizedName] = 'string'
      }
    }

    // If effect variant only, generate code from defaultVariant with pseudo-selectors
    if (effectKey && !viewportKey && otherVariantKeys.length === 0) {
      const r = await ResponsiveCodegen.generateEffectOnlyComponents(
        componentSet,
        componentName,
      )
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return r
    }

    // If no viewport variant, just handle other variants
    if (!viewportKey) {
      const r = await ResponsiveCodegen.generateNonViewportVariantComponents(
        componentSet,
        componentName,
        otherVariantKeys,
        variants,
      )
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return r
    }

    // If no other variants, use existing viewport-only logic
    if (otherVariantKeys.length === 0) {
      const r = await ResponsiveCodegen.generateViewportResponsiveComponents(
        componentSet,
        componentName,
      )
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return r
    }

    // Handle both viewport and other variants
    // Group by ALL variant keys combined, then by viewport within each group
    // e.g., for size+variant: { "Md|primary" => { "mobile" => Component, "pc" => Component }, ... }

    // Reverse mapping from sanitized to original names
    const sanitizedToOriginal: Record<string, string> = {}
    for (const [original, sanitized] of Object.entries(variantKeyToSanitized)) {
      sanitizedToOriginal[sanitized] = original
    }

    // Sanitized variant keys for code generation
    const sanitizedVariantKeys = otherVariantKeys.map(
      (key) => variantKeyToSanitized[key],
    )

    // Build a composite key from all variant values (using sanitized names)
    const buildCompositeKey = (
      variantProps: Record<string, string>,
    ): string => {
      return otherVariantKeys
        .map((key) => {
          const sanitizedKey = variantKeyToSanitized[key]
          return `${sanitizedKey}=${variantProps[key] || '__default__'}`
        })
        .join('|')
    }

    // Parse composite key to original Figma variant names (for getSelectorPropsForGroup)
    const parseCompositeKeyToOriginal = (
      compositeKey: string,
    ): Record<string, string> => {
      const result: Record<string, string> = {}
      for (const part of compositeKey.split('|')) {
        const [sanitizedKey, value] = part.split('=')
        const originalKey = sanitizedToOriginal[sanitizedKey]
        if (originalKey) {
          result[originalKey] = value
        }
      }
      return result
    }

    const byCompositeVariant = new Map<
      string,
      Map<BreakpointKey, ComponentNode>
    >()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      // Skip effect variants for grouping (they become pseudo-selectors)
      if (effectKey && variantProps[effectKey] !== 'default') continue

      const viewportValue = variantProps[viewportKey]
      if (!viewportValue) continue

      const breakpoint = viewportToBreakpoint(viewportValue)
      const compositeKey = buildCompositeKey(variantProps)

      if (!byCompositeVariant.has(compositeKey)) {
        byCompositeVariant.set(compositeKey, new Map())
      }
      const byBreakpoint = byCompositeVariant.get(compositeKey)
      if (byBreakpoint) {
        byBreakpoint.set(breakpoint, component)
      }
    }

    if (byCompositeVariant.size === 0) {
      perfEnd('generateVariantResponsiveComponents(total)', tTotal)
      return []
    }

    const responsiveCodegen = new ResponsiveCodegen(null)

    // Step 1: For each variant combination, merge by viewport to get responsive props
    const responsivePropsByComposite = new Map<
      string,
      Map<BreakpointKey, NodeTree>
    >()

    // Build trees for all composite variants — each is independent.
    for (const [compositeKey, viewportComponents] of byCompositeVariant) {
      // Use original names for Figma data access
      const variantFilter = parseCompositeKeyToOriginal(compositeKey)

      // Build trees for each viewport within this composite.
      const treesByBreakpoint = new Map<BreakpointKey, NodeTree>()
      for (const [bp, component] of viewportComponents) {
        let t = perfStart()
        const codegen = new Codegen(component)
        const tree = await codegen.getTree()
        perfEnd('Codegen.getTree(variant)', t)

        // Get pseudo-selector props for this specific variant group AND viewport
        if (effectKey) {
          const viewportValue = component.variantProperties?.[viewportKey]
          t = perfStart()
          const selectorProps = await getSelectorPropsForGroup(
            componentSet,
            variantFilter,
            viewportValue,
          )
          perfEnd('getSelectorPropsForGroup()', t)
          if (Object.keys(selectorProps).length > 0) {
            tree.props = Object.assign({}, tree.props, selectorProps)
          }
        }

        treesByBreakpoint.set(bp, tree)
      }

      responsivePropsByComposite.set(compositeKey, treesByBreakpoint)
    }

    // Step 2: Merge across variant values, handling multiple variant keys
    const mergedCode = responsiveCodegen.generateMultiVariantMergedCode(
      sanitizedVariantKeys,
      responsivePropsByComposite,
      0,
    )

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, mergedCode, variants)],
    ]
    return result
  }

  /**
   * Generate component code for COMPONENT_SET with effect variant only (no other variants).
   * Uses defaultVariant as the base and adds pseudo-selector props from getSelectorProps.
   */
  private static async generateEffectOnlyComponents(
    componentSet: ComponentSetNode,
    componentName: string,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    // Use defaultVariant as the base component
    const defaultComponent = componentSet.defaultVariant
    if (!defaultComponent) {
      return []
    }

    // Get base props from defaultVariant
    const codegen = new Codegen(defaultComponent)
    const tree = await codegen.getTree()

    // Get pseudo-selector props (hover, active, disabled, etc.)
    const selectorProps = await getSelectorPropsForGroup(componentSet, {})
    if (Object.keys(selectorProps).length > 0) {
      tree.props = Object.assign({}, tree.props, selectorProps)
    }

    // Render the tree to JSX
    const code = Codegen.renderTree(tree, 0)

    // Collect BOOLEAN and INSTANCE_SWAP props for the interface
    // (effect is handled via pseudo-selectors, VARIANT keys don't exist in effect-only path)
    const variants: Record<string, string> = {}
    for (const name in componentSet.componentPropertyDefinitions) {
      const definition = componentSet.componentPropertyDefinitions[name]
      if (definition.type === 'INSTANCE_SWAP') {
        variants[sanitizePropertyName(name)] = 'React.ReactNode'
      } else if (definition.type === 'BOOLEAN') {
        variants[sanitizePropertyName(name)] = 'boolean'
      } else if (definition.type === 'TEXT') {
        variants[sanitizePropertyName(name)] = 'string'
      }
    }

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, code, variants)],
    ]
    return result
  }

  /**
   * Generate component code for COMPONENT_SET with non-viewport variants only.
   */
  private static async generateNonViewportVariantComponents(
    componentSet: ComponentSetNode,
    componentName: string,
    variantKeys: string[],
    variants: Record<string, string>,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    if (variantKeys.length === 0) {
      return []
    }

    // Check if componentSet has effect variant (pseudo-selector)
    let hasEffect = false
    for (const key in componentSet.componentPropertyDefinitions) {
      if (key.toLowerCase() === 'effect') {
        hasEffect = true
        break
      }
    }

    // Map from original name to sanitized name
    const variantKeyToSanitized: Record<string, string> = {}
    for (const key of variantKeys) {
      variantKeyToSanitized[key] = sanitizePropertyName(key)
    }
    const sanitizedVariantKeys = variantKeys.map(
      (key) => variantKeyToSanitized[key],
    )

    // Single variant key: use simpler single-dimension merge
    if (variantKeys.length === 1) {
      return ResponsiveCodegen.generateSingleVariantComponents(
        componentSet,
        componentName,
        variantKeys[0],
        sanitizedVariantKeys[0],
        variants,
        hasEffect,
      )
    }

    // Multiple variant keys: build trees for ALL combinations, use multi-dimensional merge
    // Build composite key for each component (e.g., "size=lg|varient=primary")
    const buildCompositeKey = (
      variantProps: Record<string, string>,
    ): string => {
      return variantKeys
        .map((key) => {
          const sanitizedKey = variantKeyToSanitized[key]
          return `${sanitizedKey}=${variantProps[key] || '__default__'}`
        })
        .join('|')
    }

    // Reverse mapping from sanitized to original names (for getSelectorPropsForGroup)
    const sanitizedToOriginal: Record<string, string> = {}
    for (const [original, sanitized] of Object.entries(variantKeyToSanitized)) {
      sanitizedToOriginal[sanitized] = original
    }

    const parseCompositeKeyToOriginal = (
      compositeKey: string,
    ): Record<string, string> => {
      const result: Record<string, string> = {}
      for (const part of compositeKey.split('|')) {
        const [sanitizedKey, value] = part.split('=')
        const originalKey = sanitizedToOriginal[sanitizedKey]
        if (originalKey) {
          result[originalKey] = value
        }
      }
      return result
    }

    // Group components by composite variant key (all variant values combined)
    const componentsByComposite = new Map<string, ComponentNode>()
    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}

      // Skip effect variants (they become pseudo-selectors)
      if (hasEffect) {
        const effectValue =
          variantProps[
            Object.keys(componentSet.componentPropertyDefinitions).find(
              (k) => k.toLowerCase() === 'effect',
            ) || ''
          ]
        if (effectValue && effectValue !== 'default') continue
      }

      const compositeKey = buildCompositeKey(variantProps)
      if (!componentsByComposite.has(compositeKey)) {
        componentsByComposite.set(compositeKey, component)
      }
    }

    // Build trees for each combination
    const treesByComposite = new Map<string, NodeTree>()
    for (const [compositeKey, component] of componentsByComposite) {
      const variantFilter = parseCompositeKeyToOriginal(compositeKey)
      let t = perfStart()
      const selectorProps = hasEffect
        ? await getSelectorPropsForGroup(componentSet, variantFilter)
        : null
      perfEnd('getSelectorPropsForGroup(nonViewport)', t)

      t = perfStart()
      const codegen = new Codegen(component)
      const tree = await codegen.getTree()
      perfEnd('Codegen.getTree(nonViewportVariant)', t)

      // Use the component tree from addComponentTree if available — it includes
      // ALL children (even invisible BOOLEAN-controlled ones) with condition fields
      // and INSTANCE_SWAP slot placeholders, which buildTree() skips.
      const componentTree = codegen.getComponentTree()
      if (componentTree) {
        tree.children = componentTree.tree.children
      }

      if (selectorProps && Object.keys(selectorProps).length > 0) {
        tree.props = Object.assign({}, tree.props, selectorProps)
      }
      treesByComposite.set(compositeKey, tree)
    }

    // Use multi-dimensional merge (same as viewport+variant path but without viewport)
    // Wrap each tree in a single-breakpoint map so generateMultiVariantMergedCode works
    const treesByCompositeAndBreakpoint = new Map<
      string,
      Map<BreakpointKey, NodeTree>
    >()
    for (const [compositeKey, tree] of treesByComposite) {
      const singleBreakpointMap = new Map<BreakpointKey, NodeTree>()
      singleBreakpointMap.set('pc', tree)
      treesByCompositeAndBreakpoint.set(compositeKey, singleBreakpointMap)
    }

    const responsiveCodegen = new ResponsiveCodegen(null)
    const mergedCode = responsiveCodegen.generateMultiVariantMergedCode(
      sanitizedVariantKeys,
      treesByCompositeAndBreakpoint,
      0,
    )

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, mergedCode, variants)],
    ]
    return result
  }

  /**
   * Generate component code for single variant key (original simple path).
   */
  private static async generateSingleVariantComponents(
    componentSet: ComponentSetNode,
    componentName: string,
    variantKey: string,
    sanitizedVariantKey: string,
    variants: Record<string, string>,
    hasEffect: boolean,
  ): Promise<ReadonlyArray<readonly [string, string]>> {
    // Group components by variant value
    const componentsByVariant = new Map<string, ComponentNode>()

    for (const child of componentSet.children) {
      if (child.type !== 'COMPONENT') continue

      const component = child as ComponentNode
      const variantProps = component.variantProperties || {}
      const variantValue = variantProps[variantKey] || '__default__'

      if (!componentsByVariant.has(variantValue)) {
        componentsByVariant.set(variantValue, component)
      }
    }

    // Build trees for each variant
    const treesByVariant = new Map<string, NodeTree>()
    for (const [variantValue, component] of componentsByVariant) {
      const variantFilter: Record<string, string> = {
        [variantKey]: variantValue,
      }
      let t = perfStart()
      const selectorProps = hasEffect
        ? await getSelectorPropsForGroup(componentSet, variantFilter)
        : null
      perfEnd('getSelectorPropsForGroup(nonViewport)', t)

      t = perfStart()
      const codegen = new Codegen(component)
      const tree = await codegen.getTree()
      perfEnd('Codegen.getTree(nonViewportVariant)', t)

      // Use the component tree from addComponentTree if available — it includes
      // ALL children (even invisible BOOLEAN-controlled ones) with condition fields
      // and INSTANCE_SWAP slot placeholders, which buildTree() skips.
      const componentTree = codegen.getComponentTree()
      if (componentTree) {
        tree.children = componentTree.tree.children
      }

      if (selectorProps && Object.keys(selectorProps).length > 0) {
        tree.props = Object.assign({}, tree.props, selectorProps)
      }
      treesByVariant.set(variantValue, tree)
    }

    // Generate merged code with variant conditionals
    const responsiveCodegen = new ResponsiveCodegen(null)
    const mergedCode = responsiveCodegen.generateVariantOnlyMergedCode(
      sanitizedVariantKey,
      treesByVariant,
      0,
    )

    const result: Array<readonly [string, string]> = [
      [componentName, renderComponent(componentName, mergedCode, variants)],
    ]
    return result
  }

  /**
   * Generate merged code from NodeTree objects across both viewport and variant dimensions.
   * First applies responsive merging per variant, then variant conditional merging.
   */
  generateVariantMergedCode(
    variantKey: string,
    treesByVariantAndBreakpoint: Map<string, Map<BreakpointKey, NodeTree>>,
    depth: number,
  ): string {
    // First, for each variant value, merge across breakpoints
    const mergedTreesByVariant = new Map<string, NodeTree>()

    for (const [
      variantValue,
      treesByBreakpoint,
    ] of treesByVariantAndBreakpoint) {
      const firstTree = firstMapValue(treesByBreakpoint)
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // Also merge children recursively
      const mergedChildren =
        this.mergeChildrenAcrossBreakpoints(treesByBreakpoint)

      mergedTreesByVariant.set(variantValue, {
        ...firstTree,
        props: mergedProps,
        children: mergedChildren,
      })
    }

    // Then merge across variant values
    return this.generateVariantOnlyMergedCode(
      variantKey,
      mergedTreesByVariant,
      depth,
    )
  }

  /**
   * Merge children across breakpoints for a single variant value.
   */
  private mergeChildrenAcrossBreakpoints(
    treesByBreakpoint: Map<BreakpointKey, NodeTree>,
  ): NodeTree[] {
    const childrenMaps = new Map<BreakpointKey, Map<string, NodeTree[]>>()
    for (const [bp, tree] of treesByBreakpoint) {
      childrenMaps.set(bp, this.treeChildrenToMap(tree))
    }

    // Get all child names in stable merged order across all breakpoints
    const allChildNames = mergeChildNameOrder(childrenMaps)

    const mergedChildren: NodeTree[] = []

    for (const childName of allChildNames) {
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByBreakpoint = new Map<BreakpointKey, NodeTree>()
        const presentBreakpoints = new Set<BreakpointKey>()

        for (const [bp, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByBreakpoint.set(bp, children[childIndex])
            presentBreakpoints.add(bp)
          }
        }

        if (childByBreakpoint.size > 0) {
          for (const bp of treesByBreakpoint.keys()) {
            if (!presentBreakpoints.has(bp)) {
              const firstChildTree = firstMapValue(childByBreakpoint)
              const hiddenTree: NodeTree = {
                ...firstChildTree,
                props: { ...firstChildTree.props, display: 'none' },
              }
              childByBreakpoint.set(bp, hiddenTree)
            }
          }

          // Merge this child's props across breakpoints
          const firstChildTree = firstMapValue(childByBreakpoint)
          const propsMap = new Map<BreakpointKey, Props>()
          for (const [bp, tree] of childByBreakpoint) {
            propsMap.set(bp, tree.props)
          }
          const mergedProps = mergePropsToResponsive(propsMap)

          // Recursively merge grandchildren
          const grandchildren =
            this.mergeChildrenAcrossBreakpoints(childByBreakpoint)

          mergedChildren.push({
            ...firstChildTree,
            props: mergedProps,
            children: grandchildren,
          })
        }
      }
    }

    return mergedChildren
  }

  /**
   * Generate merged code from NodeTree objects across variant values only (no viewport).
   * Creates conditional props: { scroll: [...], default: [...] }[status]
   * And conditional nodes: {status === "scroll" && <Node/>}
   */
  generateVariantOnlyMergedCode(
    variantKey: string,
    treesByVariant: Map<string, NodeTree>,
    depth: number,
  ): string {
    const firstTree = firstMapValue(treesByVariant)

    // Merge props across variants
    const propsMap = new Map<string, Record<string, unknown>>()
    for (const [variant, tree] of treesByVariant) {
      propsMap.set(variant, tree.props)
    }
    const mergedProps = mergePropsToVariant(variantKey, propsMap)

    // Handle TEXT nodes
    if (firstTree.textChildren && firstTree.textChildren.length > 0) {
      const mergedTextChildren = this.mergeTextChildrenAcrossVariants(
        variantKey,
        treesByVariant,
      )
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        mergedTextChildren,
      )
    }

    // Merge children across variants
    const childrenCodes: string[] = []
    const childrenMaps = new Map<string, Map<string, NodeTree[]>>()
    for (const [variant, tree] of treesByVariant) {
      childrenMaps.set(variant, this.treeChildrenToMap(tree))
    }

    // Get all child names in stable merged order across all variants
    const allChildNames = mergeChildNameOrder(childrenMaps)

    for (const childName of allChildNames) {
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByVariant = new Map<string, NodeTree>()
        const presentVariants = new Set<string>()

        for (const [variant, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByVariant.set(variant, children[childIndex])
            presentVariants.add(variant)
          }
        }

        if (childByVariant.size > 0) {
          // Check if child exists in all variants or only some
          const existsInAllVariants =
            presentVariants.size === treesByVariant.size

          if (existsInAllVariants) {
            // Child exists in all variants - merge props
            const childCode = this.generateVariantOnlyMergedCode(
              variantKey,
              childByVariant,
              0,
            )

            // Check if all variants share the same BOOLEAN condition
            const firstChild = firstMapValue(childByVariant)
            const condition = firstChild.condition
            if (condition) {
              let allSameCondition = true
              for (const child of childByVariant.values()) {
                if (child.condition !== condition) {
                  allSameCondition = false
                  break
                }
              }
              if (allSameCondition) {
                if (childCode.includes('\n')) {
                  childrenCodes.push(
                    `{${condition} && (\n${paddingLeftMultiline(childCode, 1)}\n)}`,
                  )
                } else {
                  childrenCodes.push(`{${condition} && ${childCode}}`)
                }
                continue
              }
            }

            // Handle INSTANCE_SWAP slot placeholders
            if (firstChild.isSlot) {
              childrenCodes.push(`{${firstChild.component}}`)
              continue
            }

            childrenCodes.push(childCode)
          } else {
            // Child exists only in some variants - use conditional rendering
            const presentVariantsList = [...presentVariants]

            // Check if present children share a common BOOLEAN condition
            const sharedCondition = this.getSharedCondition(childByVariant)

            if (presentVariantsList.length === 1) {
              // Only one variant has this child: {status === "scroll" && <Node/>}
              const onlyVariant = presentVariantsList[0]
              const childTree = childByVariant.get(onlyVariant)
              if (!childTree) continue
              const childCode = Codegen.renderTree(childTree, 0)
              const variantCondition = `${variantKey} === "${onlyVariant}"`
              const fullCondition = sharedCondition
                ? `${sharedCondition} && ${variantCondition}`
                : variantCondition
              const formattedChildCode = childCode.includes('\n')
                ? `(\n${paddingLeftMultiline(childCode, 1)}\n)`
                : childCode
              childrenCodes.push(`{${fullCondition} && ${formattedChildCode}}`)
            } else {
              // Multiple (but not all) variants have this child
              // Use conditional rendering with OR
              const conditions = presentVariantsList
                .map((v) => `${variantKey} === "${v}"`)
                .join(' || ')
              const variantCondition = `(${conditions})`
              const fullCondition = sharedCondition
                ? `${sharedCondition} && ${variantCondition}`
                : variantCondition
              const childCode = this.generateVariantOnlyMergedCode(
                variantKey,
                childByVariant,
                0,
              )
              const formattedChildCode = childCode.includes('\n')
                ? `(\n${paddingLeftMultiline(childCode, 1)}\n)`
                : childCode
              childrenCodes.push(`{${fullCondition} && ${formattedChildCode}}`)
            }
          }
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }

  /**
   * Generate merged code from NodeTree objects across multiple variant dimensions and viewport.
   * Handles composite keys like "size=Md|variant=primary" and produces nested variant conditionals.
   *
   * For props that differ:
   * - Across viewport only: responsive array ["mobile", null, null, null, "desktop"]
   * - Across one variant only: { Md: "value1", Sm: "value2" }[size]
   * - Across both: { Md: ["mobile", null, null, null, "desktop"], Sm: "fixed" }[size]
   * - Across multiple variants: nested conditionals or combined
   */
  generateMultiVariantMergedCode(
    variantKeys: string[],
    treesByCompositeAndBreakpoint: Map<string, Map<BreakpointKey, NodeTree>>,
    depth: number,
  ): string {
    // First, for each composite variant, merge across breakpoints
    const mergedTreesByComposite = new Map<string, NodeTree>()

    for (const [
      compositeKey,
      treesByBreakpoint,
    ] of treesByCompositeAndBreakpoint) {
      const firstTree = firstMapValue(treesByBreakpoint)
      const propsMap = new Map<BreakpointKey, Props>()
      for (const [bp, tree] of treesByBreakpoint) {
        propsMap.set(bp, tree.props)
      }
      const mergedProps = mergePropsToResponsive(propsMap)

      // Also merge children recursively
      const mergedChildren =
        this.mergeChildrenAcrossBreakpoints(treesByBreakpoint)

      mergedTreesByComposite.set(compositeKey, {
        ...firstTree,
        props: mergedProps,
        children: mergedChildren,
      })
    }

    // Now merge across all variant dimensions
    // We'll process each variant key in sequence, merging values
    return this.generateNestedVariantMergedCode(
      variantKeys,
      mergedTreesByComposite,
      depth,
    )
  }

  /**
   * Generate merged code with nested variant conditionals.
   * For multiple variant keys, this creates props like:
   * { primary: { Md: [...], Sm: [...] }[size], white: { Md: [...], Sm: [...] }[size] }[variant]
   */
  private generateNestedVariantMergedCode(
    variantKeys: string[],
    treesByComposite: Map<string, NodeTree>,
    depth: number,
  ): string {
    const firstTree = firstMapValue(treesByComposite)

    // Build props map indexed by composite key
    const propsMap = new Map<string, Record<string, unknown>>()
    for (const [compositeKey, tree] of treesByComposite) {
      propsMap.set(compositeKey, tree.props)
    }

    // Merge props across all composite variants
    const mergedProps = this.mergePropsAcrossComposites(variantKeys, propsMap)

    // Handle TEXT nodes
    if (firstTree.textChildren && firstTree.textChildren.length > 0) {
      const mergedTextChildren = this.mergeTextChildrenAcrossComposites(
        variantKeys,
        treesByComposite,
      )
      return renderNode(
        firstTree.component,
        mergedProps,
        depth,
        mergedTextChildren,
      )
    }

    // For children, we need to merge across all composite variants
    const childrenCodes: string[] = []

    // Build children maps for each composite variant
    const childrenMaps = new Map<string, Map<string, NodeTree[]>>()
    for (const [compositeKey, tree] of treesByComposite) {
      childrenMaps.set(compositeKey, this.treeChildrenToMap(tree))
    }

    // Get all unique child names in stable merged order across all composites
    const allChildNames = mergeChildNameOrder(childrenMaps)

    // Process each child
    for (const childName of allChildNames) {
      let maxChildCount = 0
      for (const childMap of childrenMaps.values()) {
        const children = childMap.get(childName)
        if (children) {
          maxChildCount = Math.max(maxChildCount, children.length)
        }
      }

      for (let childIndex = 0; childIndex < maxChildCount; childIndex++) {
        const childByComposite = new Map<string, NodeTree>()
        const presentComposites = new Set<string>()

        for (const [compositeKey, childMap] of childrenMaps) {
          const children = childMap.get(childName)
          if (children && children.length > childIndex) {
            childByComposite.set(compositeKey, children[childIndex])
            presentComposites.add(compositeKey)
          }
        }

        if (childByComposite.size > 0) {
          const existsInAll = presentComposites.size === treesByComposite.size

          if (existsInAll) {
            // Child exists in all variants - recursively merge
            const childCode = this.generateNestedVariantMergedCode(
              variantKeys,
              childByComposite,
              0,
            )

            // Check if all composites share the same BOOLEAN condition
            const firstChild = firstMapValue(childByComposite)
            const condition = firstChild.condition
            if (condition) {
              // Check all composites have the same condition
              let allSameCondition = true
              for (const child of childByComposite.values()) {
                if (child.condition !== condition) {
                  allSameCondition = false
                  break
                }
              }
              if (allSameCondition) {
                // Wrap with BOOLEAN conditional
                if (childCode.includes('\n')) {
                  childrenCodes.push(
                    `{${condition} && (\n${paddingLeftMultiline(childCode, 1)}\n)}`,
                  )
                } else {
                  childrenCodes.push(`{${condition} && ${childCode}}`)
                }
                continue
              }
            }

            // Handle INSTANCE_SWAP slot placeholders
            if (firstChild.isSlot) {
              childrenCodes.push(`{${firstChild.component}}`)
              continue
            }

            childrenCodes.push(childCode)
          } else {
            // Child exists only in some variants - conditional rendering
            // Find which variant key(s) control this child's presence
            const presentKeys = [...presentComposites]
            const absentKeys = [...treesByComposite.keys()].filter(
              (k) => !presentComposites.has(k),
            )

            // Parse all composite keys to find the controlling variant dimension
            const parsedPresent = presentKeys.map((k) =>
              this.parseCompositeKey(k),
            )
            const parsedAbsent = absentKeys.map((k) =>
              this.parseCompositeKey(k),
            )

            // For each variant key, check if it fully explains presence/absence
            let controllingKey: string | undefined
            let presentValues: string[] = []

            for (const vk of variantKeys) {
              const presentVals = new Set(parsedPresent.map((p) => p[vk]))
              const absentVals = new Set(parsedAbsent.map((p) => p[vk]))

              // Check if there's no overlap — this key fully explains presence
              let hasOverlap = false
              for (const v of presentVals) {
                if (absentVals.has(v)) {
                  hasOverlap = true
                  break
                }
              }

              if (!hasOverlap) {
                controllingKey = vk
                presentValues = [...presentVals]
                break
              }
            }

            // Check if present children share a common BOOLEAN condition
            const sharedCondition = this.getSharedCondition(childByComposite)

            if (controllingKey && presentValues.length > 0) {
              // Single controlling key — generate condition on that key
              // Recursively merge the child across the present composites
              const childCode =
                childByComposite.size === 1
                  ? Codegen.renderTree(firstMapValue(childByComposite), 0)
                  : this.generateNestedVariantMergedCode(
                      variantKeys,
                      childByComposite,
                      0,
                    )

              if (presentValues.length === 1) {
                // {key === "value" && <Node/>}
                const variantCondition = `${controllingKey} === "${presentValues[0]}"`
                const fullCondition = sharedCondition
                  ? `${sharedCondition} && ${variantCondition}`
                  : variantCondition
                const formattedChildCode = childCode.includes('\n')
                  ? `(\n${paddingLeftMultiline(childCode, 1)}\n)`
                  : childCode
                childrenCodes.push(
                  `{${fullCondition} && ${formattedChildCode}}`,
                )
              } else {
                // {(key === "a" || key === "b") && <Node/>}
                const conditions = presentValues
                  .map((v) => `${controllingKey} === "${v}"`)
                  .join(' || ')
                const variantCondition = `(${conditions})`
                const fullCondition = sharedCondition
                  ? `${sharedCondition} && ${variantCondition}`
                  : variantCondition
                const formattedChildCode = childCode.includes('\n')
                  ? `(\n${paddingLeftMultiline(childCode, 1)}\n)`
                  : childCode
                childrenCodes.push(
                  `{${fullCondition} && ${formattedChildCode}}`,
                )
              }
            } else {
              // Multiple keys control presence — build combined condition
              // Collect unique composite value combinations that have this child
              const conditionParts: string[] = []
              for (const compositeKey of presentKeys) {
                const parsed = this.parseCompositeKey(compositeKey)
                const parts = variantKeys.map(
                  (vk) => `${vk} === "${parsed[vk]}"`,
                )
                conditionParts.push(`(${parts.join(' && ')})`)
              }
              const variantCondition = `(${conditionParts.join(' || ')})`
              const fullCondition = sharedCondition
                ? `${sharedCondition} && ${variantCondition}`
                : variantCondition
              const childCode =
                childByComposite.size === 1
                  ? Codegen.renderTree(firstMapValue(childByComposite), 0)
                  : this.generateNestedVariantMergedCode(
                      variantKeys,
                      childByComposite,
                      0,
                    )
              const formattedChildCode = childCode.includes('\n')
                ? `(\n${paddingLeftMultiline(childCode, 1)}\n)`
                : childCode
              childrenCodes.push(`{${fullCondition} && ${formattedChildCode}}`)
            }
          }
        }
      }
    }

    return renderNode(firstTree.component, mergedProps, depth, childrenCodes)
  }

  /**
   * Parse a composite key like "size=lg|varient=primary" into { size: "lg", varient: "primary" }.
   */
  private parseCompositeKey(compositeKey: string): Record<string, string> {
    const parsed: Record<string, string> = {}
    for (const part of compositeKey.split('|')) {
      const [key, value] = part.split('=')
      parsed[key] = value
    }
    return parsed
  }

  /**
   * Check if all children in a map share the same BOOLEAN condition.
   * Returns the shared condition string, or undefined if not all share one.
   */
  private getSharedCondition(
    childMap: Map<string, NodeTree>,
  ): string | undefined {
    let sharedCondition: string | undefined
    let first = true
    for (const child of childMap.values()) {
      if (first) {
        sharedCondition = child.condition
        first = false
        continue
      }
      if (child.condition !== sharedCondition) {
        return undefined
      }
    }
    return sharedCondition
  }

  /**
   * Merge props across composite variant keys.
   * Creates nested variant conditionals for props that differ.
   */
  private mergePropsAcrossComposites(
    variantKeys: string[],
    propsMap: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    // Collect all prop keys
    const allPropKeys = new Set<string>()
    for (const props of propsMap.values()) {
      for (const key of Object.keys(props)) {
        allPropKeys.add(key)
      }
    }

    // For each prop, determine how to merge it
    for (const propKey of allPropKeys) {
      // Check if prop is a pseudo-selector (needs special handling)
      if (propKey.startsWith('_')) {
        // Collect pseudo-selector props across all composites
        // For composites that don't have this pseudo-selector, use empty object
        // so that inner props get null values for those composites
        const pseudoPropsMap = new Map<string, Record<string, unknown>>()
        let hasPseudoSelector = false
        for (const [compositeKey, props] of propsMap) {
          if (
            propKey in props &&
            typeof props[propKey] === 'object' &&
            props[propKey] !== null
          ) {
            pseudoPropsMap.set(
              compositeKey,
              props[propKey] as Record<string, unknown>,
            )
            hasPseudoSelector = true
          } else {
            // Composite doesn't have this pseudo-selector, use empty object
            // This ensures inner props get null for this composite
            pseudoPropsMap.set(compositeKey, {})
          }
        }
        if (hasPseudoSelector) {
          const merged = this.mergePropsAcrossComposites(
            variantKeys,
            pseudoPropsMap,
          )
          // Only include pseudo-selector if it has at least one prop after merging
          if (Object.keys(merged).length > 0) {
            result[propKey] = merged
          }
        }
        continue
      }

      // Collect values for this prop across all composites
      // For composites that don't have this prop (or value is undefined), use null
      const valuesByComposite = new Map<string, unknown>()
      let hasValue = false
      for (const [compositeKey, props] of propsMap) {
        if (propKey in props && props[propKey] !== undefined) {
          valuesByComposite.set(compositeKey, props[propKey])
          hasValue = true
        } else {
          // Composite doesn't have this prop (or value is undefined), use null
          valuesByComposite.set(compositeKey, null)
        }
      }

      if (!hasValue) continue

      // Check if all values are the same (including null checks)
      const firstValue = firstMapValue(valuesByComposite)
      let allValsSame = true
      for (const value of valuesByComposite.values()) {
        if (!isEqual(value as PropValue, firstValue as PropValue)) {
          allValsSame = false
          break
        }
      }

      if (allValsSame && firstValue !== null) {
        // All values are the same and not null - use as-is
        result[propKey] = firstValue
      } else {
        // Values differ or some are null - need to create variant conditional
        // Filter out null values for the conditional (only include composites that have the prop)
        const nonNullValues = new Map<string, unknown>()
        for (const [compositeKey, value] of valuesByComposite) {
          if (value !== null) {
            nonNullValues.set(compositeKey, value)
          }
        }

        if (nonNullValues.size > 0) {
          // Try to find which variant key causes the difference
          result[propKey] = this.createNestedVariantProp(
            variantKeys,
            nonNullValues,
          )
        }
      }
    }

    return result
  }

  /**
   * Create a nested variant prop value for props that differ across multiple variant dimensions.
   * Optimized to minimize nesting depth by choosing the best outer variant key.
   */
  private createNestedVariantProp(
    variantKeys: string[],
    valuesByComposite: Map<string, unknown>,
  ): unknown {
    // Parse composite keys
    const parseCompositeKey = (
      compositeKey: string,
    ): Record<string, string> => {
      const parsed: Record<string, string> = {}
      for (const part of compositeKey.split('|')) {
        const [key, value] = part.split('=')
        parsed[key] = value
      }
      return parsed
    }

    // If only one variant key, create simple conditional
    if (variantKeys.length === 1) {
      const variantKey = variantKeys[0]
      const valuesByVariant: Record<string, unknown> = {}

      for (const [compositeKey, value] of valuesByComposite) {
        const parsed = parseCompositeKey(compositeKey)
        const variantValue = parsed[variantKey]
        valuesByVariant[variantValue] = value
      }

      // Check if all values are the same
      const variantValues = Object.values(valuesByVariant)
      let allVariantsSame = true
      for (let i = 1; i < variantValues.length; i++) {
        if (
          !isEqual(variantValues[i] as PropValue, variantValues[0] as PropValue)
        ) {
          allVariantsSame = false
          break
        }
      }
      if (allVariantsSame) {
        return variantValues[0]
      }

      return createVariantPropValue(
        variantKey,
        valuesByVariant as Record<string, PropValue>,
      )
    }

    // For multiple variant keys, calculate nesting cost for each possible outer key
    // and choose the one with minimum cost
    interface CandidateResult {
      variantKey: string
      cost: number
      nestedValues: Record<string, unknown>
    }

    const candidates: CandidateResult[] = []

    for (const variantKey of variantKeys) {
      const valuesByVariant = new Map<string, Map<string, unknown>>()

      for (const [compositeKey, value] of valuesByComposite) {
        const parsed = parseCompositeKey(compositeKey)
        const variantValue = parsed[variantKey]

        if (!valuesByVariant.has(variantValue)) {
          valuesByVariant.set(variantValue, new Map())
        }
        // Build a sub-composite key without this variant
        const subCompositeKey = variantKeys
          .filter((k) => k !== variantKey)
          .map((k) => `${k}=${parsed[k]}`)
          .join('|')
        const variantMap = valuesByVariant.get(variantValue)
        if (variantMap) {
          variantMap.set(subCompositeKey, value)
        }
      }

      // Calculate nested values and cost for this outer key
      const remainingKeys = variantKeys.filter((k) => k !== variantKey)
      const nestedValues: Record<string, unknown> = {}
      let totalCost = 0

      for (const [variantValue, subValues] of valuesByVariant) {
        // Check if all sub-values are the same (can collapse to scalar)
        let allSubSame = true
        let firstSubVal: unknown | undefined
        for (const sv of subValues.values()) {
          if (firstSubVal === undefined) {
            firstSubVal = sv
            continue
          }
          if (!isEqual(sv as PropValue, firstSubVal as PropValue)) {
            allSubSame = false
            break
          }
        }

        if (allSubSame) {
          // All same - collapse to scalar value (cost 0)
          nestedValues[variantValue] = firstMapValue(subValues)
          // Cost is 0 for scalar
        } else {
          // Need to recurse
          const nestedResult = this.createNestedVariantProp(
            remainingKeys,
            subValues,
          )
          nestedValues[variantValue] = nestedResult

          // Calculate cost based on nesting depth
          totalCost += this.calculateNestingCost(nestedResult)
        }
      }

      // Add the number of entries as a secondary cost factor
      // This ensures we prefer fewer entries when nesting costs are equal
      // Multiply by 0.1 to make it a tiebreaker (less important than nesting depth)
      const entryCost = Object.keys(nestedValues).length * 0.1

      candidates.push({
        variantKey,
        cost: totalCost + entryCost,
        nestedValues,
      })
    }

    // Find the candidate with minimum cost
    let bestCandidate = candidates[0]
    for (const candidate of candidates) {
      if (candidate.cost < bestCandidate.cost) {
        bestCandidate = candidate
      }
    }

    return createVariantPropValue(
      bestCandidate.variantKey,
      bestCandidate.nestedValues as Record<string, PropValue>,
    )
  }

  /**
   * Calculate the nesting cost of a value.
   * Scalar values have cost 0, VariantPropValue adds 1 + cost of nested values.
   */
  private calculateNestingCost(value: unknown): number {
    if (
      typeof value === 'object' &&
      value !== null &&
      '__variantProp' in value
    ) {
      const variantProp = value as {
        __variantProp: true
        values: Record<string, unknown>
      }
      let maxNestedCost = 0
      for (const nestedValue of Object.values(variantProp.values)) {
        const nestedCost = this.calculateNestingCost(nestedValue)
        maxNestedCost = Math.max(maxNestedCost, nestedCost)
      }
      return 1 + maxNestedCost
    }
    return 0
  }

  /**
   * Merge text children across variant values (single variant key).
   * If all variants have the same text, return it directly.
   * If texts differ, create variant-mapped text: {{ lg: "buttonLg", md: "button" }[size]}
   */
  private mergeTextChildrenAcrossVariants(
    variantKey: string,
    treesByVariant: Map<string, NodeTree>,
  ): string[] {
    // Collect joined text from each variant
    const textByVariant = new Map<string, string>()
    for (const [variant, tree] of treesByVariant) {
      if (tree.textChildren && tree.textChildren.length > 0) {
        textByVariant.set(variant, tree.textChildren.join(''))
      }
    }

    // If no text, return first tree's text
    if (textByVariant.size === 0) {
      const firstTree = firstMapValue(treesByVariant)
      return firstTree.textChildren || []
    }

    // Check if all texts are the same
    let allSame = true
    let firstText: string | undefined
    for (const text of textByVariant.values()) {
      if (firstText === undefined) {
        firstText = text
        continue
      }
      if (text !== firstText) {
        allSame = false
        break
      }
    }

    if (allSame) {
      return firstMapValue(treesByVariant).textChildren || []
    }

    // Texts differ — create variant-mapped text
    const entries = [...textByVariant.entries()]
      .map(([variant, text]) => `  ${variant}: "${text}"`)
      .join(',\n')
    return [`{{\n${entries}\n}[${variantKey}]}`]
  }

  /**
   * Merge text children across composite variant keys (multiple variant dimensions).
   * If all composites have the same text, return it directly.
   * If texts differ, find the controlling variant key and create variant-mapped text.
   */
  private mergeTextChildrenAcrossComposites(
    variantKeys: string[],
    treesByComposite: Map<string, NodeTree>,
  ): string[] {
    // Collect joined text from each composite
    const textByComposite = new Map<string, string>()
    for (const [compositeKey, tree] of treesByComposite) {
      if (tree.textChildren && tree.textChildren.length > 0) {
        textByComposite.set(compositeKey, tree.textChildren.join(''))
      }
    }

    // If no text, return first tree's text
    if (textByComposite.size === 0) {
      const firstTree = firstMapValue(treesByComposite)
      return firstTree.textChildren || []
    }

    // Check if all texts are the same
    let allSame = true
    let firstText: string | undefined
    for (const text of textByComposite.values()) {
      if (firstText === undefined) {
        firstText = text
        continue
      }
      if (text !== firstText) {
        allSame = false
        break
      }
    }

    if (allSame) {
      return firstMapValue(treesByComposite).textChildren || []
    }

    // Texts differ — find which variant key controls the text difference
    // Group text values by each variant key to find the simplest mapping
    for (const vk of variantKeys) {
      const textByVariantValue = new Map<string, string>()
      let isConsistent = true

      for (const [compositeKey, text] of textByComposite) {
        const parsed = this.parseCompositeKey(compositeKey)
        const variantValue = parsed[vk]
        const existing = textByVariantValue.get(variantValue)

        if (existing !== undefined && existing !== text) {
          // Same variant value maps to different texts — this key doesn't fully control
          isConsistent = false
          break
        }
        textByVariantValue.set(variantValue, text)
      }

      if (isConsistent) {
        // This variant key fully controls text — create mapping on this key
        const entries = [...textByVariantValue.entries()]
          .map(([variant, text]) => `  ${variant}: "${text}"`)
          .join(',\n')
        return [`{{\n${entries}\n}[${vk}]}`]
      }
    }

    // No single key controls — use first tree's text as fallback
    return firstMapValue(treesByComposite).textChildren || []
  }

  /**
   * Merge text children across breakpoints.
   * Compares text content and handles \n differences with responsive <br /> display.
   *
   * Example:
   * - PC: "안녕하세요 반갑습니다"
   * - Mobile: "안녕하세요\n반갑습니다"
   * Result: "안녕하세요<Box as="br" display={[null, null, null, null, 'none']} />반갑습니다"
   *
   * If there's only a space vs \n difference:
   * - PC: "안녕하세요 반갑습니다"
   * - Mobile: "안녕하세요\n반갑습니다"
   * Result: "안녕하세요<Text display={[null, null, null, null, 'none']}> </Text><br />반갑습니다"
   */
  private mergeTextChildrenAcrossBreakpoints(
    treesByBreakpoint: Map<BreakpointKey, NodeTree>,
  ): string[] {
    // Collect textChildren from all breakpoints
    const textByBreakpoint = new Map<BreakpointKey, string[]>()
    for (const [bp, tree] of treesByBreakpoint) {
      if (tree.textChildren && tree.textChildren.length > 0) {
        textByBreakpoint.set(bp, tree.textChildren)
      }
    }

    // If only one breakpoint has text, return it
    if (textByBreakpoint.size <= 1) {
      if (textByBreakpoint.size === 0) {
        return []
      }
      const firstText = firstMapValue(textByBreakpoint)
      return firstText || []
    }

    // Join all text children into single strings for comparison
    const joinedByBreakpoint = new Map<BreakpointKey, string>()
    for (const [bp, textChildren] of textByBreakpoint) {
      joinedByBreakpoint.set(bp, textChildren.join(''))
    }

    // Normalize text by removing <br /> for comparison
    const normalizeForComparison = (text: string): string => {
      return text.replace(/<br \/>/g, '\n')
    }

    // Get all unique normalized texts
    const normalizedTexts = new Map<BreakpointKey, string>()
    for (const [bp, text] of joinedByBreakpoint) {
      normalizedTexts.set(bp, normalizeForComparison(text))
    }

    // Check if all texts are identical after normalization
    const uniqueNormalized = new Set(normalizedTexts.values())
    if (uniqueNormalized.size === 1) {
      // All same, return first text children
      return firstMapValue(textByBreakpoint)
    }

    // Texts differ - need to merge with responsive <br />
    // Compare character by character, tracking where \n appears
    // Build merged text with responsive <br /> where needed
    return this.buildResponsiveTextChildren(normalizedTexts)
  }

  /**
   * Build responsive text children by comparing texts across breakpoints.
   * Inserts responsive <br /> where \n exists in some breakpoints but not others.
   */
  private buildResponsiveTextChildren(
    normalizedTexts: Map<BreakpointKey, string>,
  ): string[] {
    const breakpoints = normalizedTexts.keys()
    // Find the longest text to use as base
    let baseText = ''
    for (const [, text] of normalizedTexts) {
      if (text.length > baseText.length) {
        baseText = text
      }
    }

    // For each other breakpoint, find where they differ
    // Build a map of positions where \n appears/doesn't appear per breakpoint
    const brPositions = new Map<number, Map<BreakpointKey, boolean>>()

    // Find all \n positions in all texts
    for (const [bp, text] of normalizedTexts) {
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') {
          if (!brPositions.has(i)) {
            brPositions.set(i, new Map())
          }
          const posMap = brPositions.get(i)
          if (posMap) {
            posMap.set(bp, true)
          }
        }
      }
    }

    // For positions that don't have \n in some breakpoints, mark as false
    for (const [, bpMap] of brPositions) {
      for (const bp of breakpoints) {
        if (!bpMap.has(bp)) {
          bpMap.set(bp, false)
        }
      }
    }

    // Now build the result string
    // Replace \n with appropriate responsive <br />
    const result: string[] = []
    let currentSegment = ''

    for (let i = 0; i < baseText.length; i++) {
      const char = baseText[i]

      if (char === '\n') {
        // Check if all breakpoints have \n here
        const bpMap = brPositions.get(i)
        if (!bpMap) {
          currentSegment += '<br />'
          continue
        }

        let allHaveBr = true
        let noneHaveBr = true
        for (const v of bpMap.values()) {
          if (!v) allHaveBr = false
          if (v) noneHaveBr = false
          if (!allHaveBr && !noneHaveBr) break
        }

        if (allHaveBr) {
          // All breakpoints have <br /> - simple case
          currentSegment += '<br />'
        } else if (!noneHaveBr) {
          // Some have, some don't - need responsive display
          // Build display array: 'none' where br doesn't exist, null where it does
          const displayArray: (string | null)[] = BREAKPOINT_ORDER.map((bp) => {
            if (!bpMap.has(bp)) return null // breakpoint not in comparison
            return bpMap.get(bp) ? null : 'none'
          })

          const optimized = optimizeResponsiveValue(displayArray, 'display')

          if (optimized !== null && optimized !== 'none') {
            if (typeof optimized === 'string') {
              // Single value (shouldn't be 'none' at this point)
              currentSegment += '<br />'
            } else {
              // Responsive array
              currentSegment += `<Box as="br" display={${JSON.stringify(optimized)}} />`
            }
          }
        }
        // noneHaveBr case: shouldn't happen since we're on base text, skip
      } else {
        currentSegment += char
      }
    }

    if (currentSegment) {
      result.push(currentSegment)
    }

    return result
  }
}
