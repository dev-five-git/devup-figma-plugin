# CODEGEN ENGINE

Converts Figma `SceneNode` trees into React/TypeScript JSX using `@devup-ui/react` components.

## PIPELINE

```
SceneNode → buildTree() → NodeTree (JSON) → renderTree() → JSX string
                              ↓
              ResponsiveCodegen merges trees across breakpoints
```

Two phases in `Codegen.ts`:
1. **Build** (`buildTree`): Walks Figma node hierarchy → intermediate `NodeTree` with resolved props, component types, children
2. **Render** (`renderTree`): Static method converts `NodeTree` → indented JSX string

`INSTANCE` nodes trigger `addComponentTree()` to extract referenced components into separate output files.

## STRUCTURE

```
codegen/
├── Codegen.ts               # Core engine (buildTree + renderTree)
├── types.ts                 # NodeTree, ComponentTree, Props interfaces
├── props/                   # 22 prop getters — one per CSS concern
│   ├── index.ts             # getProps() composes all; filterPropsWithComponent()
│   ├── auto-layout.ts       # Flex direction, gap, wrap
│   ├── layout.ts            # Width, height, min/max sizing
│   ├── position.ts          # Absolute/relative positioning, z-index
│   ├── reaction.ts          # Animations, transitions, keyframes (782 lines)
│   ├── selector.ts          # Pseudo-selectors from component variants (251 lines)
│   └── ...                  # padding, border, background, blend, effect, etc.
├── render/
│   ├── index.ts             # renderNode() → JSX tag; renderComponent() → function wrapper
│   └── text.ts              # renderText() → mixed text segments with styling
├── responsive/
│   ├── index.ts             # Breakpoint constants, mergePropsToResponsive/Variant
│   └── ResponsiveCodegen.ts # Section-based responsive code generation (1569 lines)
└── utils/                   # 26 pure utility files (no barrel export)
```

## WHERE TO LOOK

| Task | Start Here | Then |
|------|-----------|------|
| Add CSS property support | `props/your-prop.ts` | Import in `props/index.ts` |
| Fix JSX output formatting | `render/index.ts` | `propsToString` in `utils/props-to-str.ts` |
| Fix component detection | `utils/get-devup-component.ts` | Maps node + props → Flex/Box/Text/etc. |
| Fix asset detection | `utils/check-asset-node.ts` | Determines Image vs SVG vs skip |
| Fix default prop filtering | `utils/is-default-prop.ts` | Also `props/index.ts:filterPropsWithComponent` |
| Add responsive breakpoint | `responsive/index.ts` | Update `BREAKPOINTS` + `BREAKPOINT_ORDER` |
| Fix responsive merging | `responsive/ResponsiveCodegen.ts` | `mergePropsToResponsive` in `responsive/index.ts` |
| Fix variant props | `utils/extract-instance-variant-props.ts` | Reads `componentProperties` from instances |
| Debug with node logging | `utils/node-proxy.ts` | `nodeProxyTracker.wrap(node)` — logs all reads |

## CONVENTIONS (CODEGEN-SPECIFIC)

- **Prop getters**: `getXxxProps(node: SceneNode) → Record<string, unknown>` — always return spread-compatible object
- **Async prop getters**: Background, border, effect, text-shadow, text-stroke, reaction use `await` (Figma API)
- **Component mapping**: `getDevupComponentByNode` for full nodes, `getDevupComponentByProps` for prop-only detection
- **Props flow**: `getProps()` → `filterProps()` (remove defaults) → `filterPropsWithComponent()` (remove component-implicit) → `propsToString()`
- **Text handling**: `renderText()` returns `{ children: string[], props }` — special path for mixed-style text segments
- **NodeTree `isComponent`**: Marks `INSTANCE` references — these render as `<ComponentName {...variantProps} />` not as nested JSX
- **Depth parameter**: `renderNode(component, props, depth, children)` — `depth=0` for children (parent handles indentation)

## KEY TYPES (`types.ts`)

```typescript
interface NodeTree {
  component: string        // 'Flex' | 'Box' | 'Text' | 'Image' | custom name
  props: Props
  children: NodeTree[]
  nodeType: string         // Figma type: 'FRAME', 'TEXT', 'INSTANCE', 'WRAPPER'
  nodeName: string         // Figma layer name
  isComponent?: boolean    // true → renders as <ComponentName> reference
  textChildren?: string[]  // TEXT nodes only — inline content
}
```

## BREAKPOINTS (`responsive/index.ts`)

| Key | Max Width | Array Index |
|-----|-----------|-------------|
| mobile | 480 | 0 |
| sm | 768 | 1 |
| tablet | 992 | 2 |
| lg | 1280 | 3 |
| pc | Infinity | 4 |

Responsive values are 5-element arrays: `[mobile, sm, tablet, lg, pc]`. `optimizeResponsiveValue` trims trailing duplicates.

## ANTI-PATTERNS (CODEGEN-SPECIFIC)

- **Never skip responsive arrays in default-prop filtering** — `is-default-prop.ts:27` explicitly allows arrays through
- **`effect` and `viewport` are reserved variant keys** — `render/index.ts:47` and `ResponsiveCodegen.ts:112` filter them out of component props
- **Rotation transform: replace, never append** — `reaction.ts` always overwrites entire `transform` value
- **SMART_ANIMATE nodes are not assets** — `check-asset-node.ts` returns `false` for nodes with animation reactions
- **TILE/PATTERN fills are backgrounds** — `check-asset-node.ts` skips these as non-image content
- **`@todo` in text-stroke.ts** — Gradient stroke support is unimplemented
