# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-10
**Commit:** 0a8c481
**Branch:** main

## OVERVIEW

Figma plugin that generates React/TypeScript components using `@devup-ui/react` from Figma designs, plus design system (Devup config) import/export. No UI iframe — codegen + menu commands only.

## STRUCTURE

```
.
├── src/
│   ├── code.ts              # Entry point (thin wrapper → code-impl)
│   ├── code-impl.ts         # Plugin bootstrap: codegen registration + command routing
│   ├── types.ts             # Shared types: ComponentType, DevupElement, DevupNode
│   ├── utils.ts             # Core helpers: getComponentName, space
│   ├── codegen/             # ** Code generation engine (see src/codegen/AGENTS.md)
│   ├── commands/            # Plugin menu commands (9 commands)
│   │   ├── devup/           # Design system export/import (JSON + Excel via SheetJS)
│   │   ├── exportAssets.ts  # Asset export (stub — commented out implementation)
│   │   ├── exportComponents.ts
│   │   └── exportPagesAndComponents.ts
│   └── utils/               # Shared utilities (color, typography, file I/O)
├── manifest.json            # Figma plugin manifest (id: 1412341601954480694)
├── rspack.config.js         # Bundler: single entry → dist/code.js
├── ui.html                  # Legacy UI (not referenced in manifest)
└── dist/code.js             # Compiled bundle (gitignored)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add new CSS property support | `src/codegen/props/` | Create `your-prop.ts`, import in `props/index.ts` |
| Add new plugin command | `src/commands/` + `manifest.json` + `code-impl.ts` | Add to manifest menu, route in `runCommand()` |
| Fix code generation output | `src/codegen/Codegen.ts` | Tree-build phase: `buildTree()`, render phase: `renderTree()` |
| Fix responsive behavior | `src/codegen/responsive/` | Breakpoints in `index.ts`, merge logic in `ResponsiveCodegen.ts` |
| Fix component rendering | `src/codegen/render/index.ts` | `renderNode()` for JSX, `renderComponent()` for wrappers |
| Add shared utility | `src/utils/` | One function per file, pure functions |
| Fix design system export | `src/commands/devup/export-devup.ts` | JSON and Excel paths |
| Fix design system import | `src/commands/devup/import-devup.ts` | Applies typography via `apply-typography.ts` |
| Understand prop filtering | `src/codegen/props/index.ts` | `filterPropsWithComponent()` removes defaults per component |
| Debug node processing | `src/codegen/utils/node-proxy.ts` | `nodeProxyTracker` logs all property access when `debug=true` |

## CONVENTIONS

- **No semicolons**, single quotes, 2-space indent (Biome enforced)
- **Strict TypeScript** — `noImplicitAny` on, no DOM types (Figma sandbox only)
- **No `any` in production code** — `noExplicitAny: off` only in `__tests__/` files
- **Warnings = errors** — `biome check --error-on-warnings`
- **One function per utility file** — `src/utils/*.ts` and `src/codegen/utils/*.ts`
- **Prop getters return spread-compatible objects** — `getXxxProps(node) → Record<string, unknown>`
- **Test co-location** — `__tests__/` directory adjacent to source, with `__snapshots__/`
- **No barrel exports in utils** — import each utility directly by path
- **Barrel exports via index.ts** — used in `codegen/props`, `codegen/render`, `codegen/responsive`, `commands/devup`

## ANTI-PATTERNS (THIS PROJECT)

- **Never treat responsive arrays as default values** — Arrays bypass `isDefaultProp` filtering (`is-default-prop.ts:27`)
- **Never pass `effect` or `viewport` as component props** — Reserved internal variant keys, handled via pseudo-selectors/responsive arrays
- **Never append rotation transforms** — Always replace entire value (`reaction.ts`)
- **Animation targets are not assets** — Nodes with `SMART_ANIMATE` reactions must not be exported as images (`check-asset-node.ts:35`)
- **Tile-mode fills are not images** — `PATTERN`/`TILE` fills are backgrounds, not exportable assets
- **Padding/margin zero-filtering is disabled** — Commented-out regexes in `is-default-prop.ts` were intentionally abandoned
- **`exportAssets` is a stub** — Entire implementation commented out, marked "in development"

## COMMANDS

```bash
bun run dev          # Rspack dev server
bun run build        # Production bundle → dist/code.js
bun run watch        # Build in watch mode
bun run test         # tsc --noEmit && bun test --coverage
bun run lint         # biome check --error-on-warnings
bun run lint:fix     # biome check --fix
```

## TOOLCHAIN

| Tool | Version | Purpose |
|------|---------|---------|
| Bun | latest | Package manager + test runner |
| Rspack | 1.7.6 | Bundler (SWC transpilation) |
| TypeScript | 5.9 | Type checking (es2015 target) |
| Biome | 2.3 | Linting + formatting |
| Husky | 9 | Pre-commit: `bun run lint && bun run test` |

## CI

GitHub Actions (`.github/workflows/CI.yml`): `bun install` → `bun run lint` → `bun test --coverage` → Codecov upload (main only). Cancel-in-progress on same ref.

## DEPENDENCIES

Only **1 runtime dep**: `jszip` (ZIP creation for component/asset export). Network: only `https://cdn.sheetjs.com` allowed (Excel support via dynamic import).

## NOTES

- Plugin runs in **Figma sandbox** — no `window`, `document`, or DOM APIs
- `ui.html` exists at root but is NOT referenced in `manifest.json` — appears to be legacy
- `debug = true` in `code-impl.ts` enables `nodeProxyTracker` which logs all Figma node property access for test case generation
- Coverage threshold is `0.9999` (`bunfig.toml`) — near 100% coverage required
- `exportPagesAndComponents.ts` is excluded from coverage (`coveragePathIgnorePatterns`)
- Codegen test file is massive: `codegen.test.ts` = 59,673 lines (snapshot-heavy)
- Only 2 lint suppressions in entire codebase (both justified with comments)
