# Devup Figma Plugin
<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache-2.0" />
  </a>
  <a href="https://github.com/dev-five-git/devup-figma-plugin/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/dev-five-git/devup-figma-plugin/CI.yml?branch=main&label=CI" alt="Build Status" />
  </a>
  <a href="https://codecov.io/gh/dev-five-git/devup-figma-plugin">
    <img src="https://img.shields.io/codecov/c/github/dev-five-git/devup-figma-plugin" alt="Codecov Coverage" />
  </a>
  <a href="https://github.com/dev-five-git/devup-figma-plugin">
    <img src="https://img.shields.io/github/stars/dev-five-git/devup-figma-plugin.svg?style=social&label=Star" alt="GitHub stars" />
  </a>
  <a href="https://github.com/dev-five-git/devup-figma-plugin/fork">
    <img src="https://img.shields.io/github/forks/dev-five-git/devup-figma-plugin.svg?style=social&label=Fork" alt="GitHub forks" />
  </a>
  <a href="https://github.com/dev-five-git/devup-figma-plugin/issues">
    <img src="https://img.shields.io/github/issues/dev-five-git/devup-figma-plugin.svg" alt="GitHub issues" />
  </a>
  <a href="https://github.com/dev-five-git/devup-figma-plugin/pulls">
    <img src="https://img.shields.io/github/issues-pr/dev-five-git/devup-figma-plugin.svg" alt="GitHub pull requests" />
  </a>
  <a href="https://github.com/dev-five-git/devup-figma-plugin/commits/main">
    <img src="https://img.shields.io/github/last-commit/dev-five-git/devup-figma-plugin.svg" alt="GitHub last commit" />
  </a>
</p>

A powerful Figma plugin that generates React/TypeScript code from Figma designs and manages Devup design system configurations. This plugin enables seamless conversion of Figma components to production-ready React code and facilitates design system synchronization.

## Features

### 🎨 Code Generation
- **React Component Generation**: Automatically converts Figma designs to React/TypeScript components using the Devup-UI format
- **Codegen Support**: Works with Figma's Dev Mode codegen feature for real-time code preview
- **Component Extraction**: Extracts and generates code for nested components
- **CLI Export**: Generates bash commands for easy file creation

### 📦 Design System Management
- **Export Devup Config**: Export your design system (colors, typography, components) in JSON or Excel format
- **Import Devup Config**: Import design system configurations back into Figma
- **Treeshaking Support**: Optimize exports by removing unused design tokens
- **Variable Support**: Handles Figma variables and color collections with multiple modes

### 🚀 Component & Asset Export
- **Component Export**: Export selected components as a ZIP file containing individual component files
- **Asset Export**: Export design assets (currently in development)

## Installation

### Prerequisites
- [Bun](https://bun.sh/) (recommended) or Node.js
- Figma Desktop App (for plugin development)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd devup-figma-plugin
```

2. Install dependencies:
```bash
bun install
```

3. Build the plugin:
```bash
bun run build
```

4. Load the plugin in Figma:
   - Open Figma Desktop
   - Go to `Plugins` → `Development` → `Import plugin from manifest...`
   - Select the `manifest.json` file from this project

## Development

### Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run build` - Build the plugin for production
- `bun run watch` - Build the plugin in watch mode
- `bun run test` - Run tests with coverage
- `bun run lint` - Check code for linting errors
- `bun run lint:fix` - Fix linting errors automatically

### Project Structure

```
src/
├── code.ts                 # Main plugin entry point
├── codegen/               # Code generation logic
│   ├── Codegen.ts        # Main codegen class
│   ├── props/            # Property generators (layout, colors, etc.)
│   ├── render/           # Component rendering logic
│   └── utils/            # Codegen utilities
├── commands/              # Plugin commands
│   ├── devup/            # Devup export/import functionality
│   ├── exportAssets.ts   # Asset export command
│   └── exportComponents.ts # Component export command
└── utils/                 # Shared utilities
```

## Usage

### Code Generation (Dev Mode)

1. Open Figma in Dev Mode
2. Select a design element (frame, component, etc.)
3. The plugin will automatically generate React/TypeScript code in the code panel
4. You can copy the generated code or use the provided CLI commands

### Export Devup Configuration

1. Select elements in your Figma file
2. Go to `Plugins` → `Devup` → `Export Devup` (or `Export Devup Excel`)
3. Choose whether to use treeshaking (removes unused tokens)
4. The configuration file will be downloaded

### Import Devup Configuration

1. Go to `Plugins` → `Devup` → `Import Devup` (or `Import Devup Excel`)
2. Select your Devup configuration file
3. The design system will be imported into Figma

### Export Components

1. Select the components you want to export
2. Go to `Plugins` → `Devup` → `Export Components`
3. A ZIP file containing all component files will be downloaded

## Technical Details

### Code Generation

The plugin converts Figma nodes to React components by:
- Analyzing layout properties (auto-layout, padding, spacing)
- Converting styles (colors, typography, effects)
- Handling component variants and instances
- Generating proper TypeScript types
- Optimizing CSS properties

### Supported Figma Features

- ✅ Auto Layout
- ✅ Components & Variants
- ✅ Text Styles & Typography
- ✅ Color Variables & Collections
- ✅ Effects (shadows, blurs)
- ✅ Borders & Strokes
- ✅ Grid Layouts
- ✅ Transform properties

### Build Configuration

- **Bundler**: Rspack
- **Language**: TypeScript
- **Linter**: Biome
- **Test Runner**: Bun
- **Package Manager**: Bun

## Testing

Run tests with coverage:
```bash
bun run test
```

Test coverage reports are generated in the `coverage/` directory.

## Contributing

1. Follow the existing code style (enforced by Biome)
2. Write tests for new features
3. Ensure all tests pass and linting checks succeed
4. Update documentation as needed

## License

[Add your license information here]

## Support

For issues, questions, or contributions, please [open an issue](link-to-issues) or contact the maintainers.
