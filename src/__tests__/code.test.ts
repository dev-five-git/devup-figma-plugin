import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import * as devupModule from '../commands/devup'
import * as exportAssetsModule from '../commands/exportAssets'
import * as exportComponentsModule from '../commands/exportComponents'
import * as exportPagesAndComponentsModule from '../commands/exportPagesAndComponents'

let codeModule: typeof import('../code-impl')

beforeAll(async () => {
  ;(globalThis as { figma?: unknown }).figma = {
    editorType: 'dev',
    mode: 'codegen',
    command: 'noop',
    codegen: { on: mock(() => {}) },
    closePlugin: mock(() => {}),
  } as unknown as typeof figma
  codeModule = await import('../code-impl')
})

beforeEach(() => {
  spyOn(devupModule, 'exportDevup').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(devupModule, 'importDevup').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(exportAssetsModule, 'exportAssets').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(exportComponentsModule, 'exportComponents').mockImplementation(
    mock(() => Promise.resolve()),
  )
  spyOn(
    exportPagesAndComponentsModule,
    'exportPagesAndComponents',
  ).mockImplementation(mock(() => Promise.resolve()))
})

afterEach(() => {
  ;(globalThis as { figma?: unknown }).figma = undefined
  mock.restore()
})

describe('runCommand', () => {
  it.each([
    ['export-devup', ['json'], 'exportDevup'],
    ['export-devup-without-treeshaking', ['json', false], 'exportDevup'],
    ['export-devup-excel', ['excel'], 'exportDevup'],
    ['export-devup-excel-without-treeshaking', ['excel', false], 'exportDevup'],
    ['import-devup', ['json'], 'importDevup'],
    ['import-devup-excel', ['excel'], 'importDevup'],
    ['export-assets', [], 'exportAssets'],
    ['export-components', [], 'exportComponents'],
    ['export-pages-and-components', [], 'exportPagesAndComponents'],
  ] as const)('dispatches %s', async (command, args, fn) => {
    const closePlugin = mock(() => {})
    const figmaMock = {
      editorType: 'figma',
      command,
      closePlugin,
    } as unknown as typeof figma

    await codeModule.runCommand(figmaMock as typeof figma)

    switch (fn) {
      case 'exportDevup':
        expect(devupModule.exportDevup).toHaveBeenCalledWith(...args)
        break
      case 'importDevup':
        expect(devupModule.importDevup).toHaveBeenCalledWith(...args)
        break
      case 'exportAssets':
        expect(exportAssetsModule.exportAssets).toHaveBeenCalled()
        break
      case 'exportComponents':
        expect(exportComponentsModule.exportComponents).toHaveBeenCalled()
        break
      case 'exportPagesAndComponents':
        expect(
          exportPagesAndComponentsModule.exportPagesAndComponents,
        ).toHaveBeenCalled()
        break
    }
    expect(closePlugin).toHaveBeenCalled()
  })
})

describe('registerCodegen', () => {
  it.each([
    [
      {
        editorType: 'dev',
        mode: 'codegen',
        command: 'noop',
      },
      {
        node: {
          type: 'COMPONENT',
          name: 'Test',
          visible: true,
        },
        language: 'devup-ui',
      },
    ],
    [
      {
        editorType: 'dev',
        mode: 'codegen',
        command: 'noop',
      },
      {
        node: {
          type: 'FRAME',
          name: 'Main',
          visible: true,
        },
        language: 'devup-ui',
      },
    ],
    [
      {
        editorType: 'dev',
        mode: 'codegen',
        command: 'noop',
      },
      {
        node: {
          type: 'FRAME',
          name: 'Other',
          visible: true,
        },
        language: 'other',
      },
    ],
  ] as const)('should register codegen', async (figmaInfo, event) => {
    const figmaMock = {
      ...figmaInfo,
      codegen: { on: mock(() => {}) },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma
    codeModule.registerCodegen(figmaMock)
    expect(figmaMock.codegen.on).toHaveBeenCalledWith(
      'generate',
      expect.any(Function),
    )

    expect(
      await (figmaMock.codegen.on as ReturnType<typeof mock>).mock.calls[0][1](
        event,
      ),
    ).toMatchSnapshot()
  })

  it('should generate responsive code when root node is SECTION', async () => {
    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: { on: mock(() => {}) },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    const sectionNode = {
      type: 'SECTION',
      name: 'ResponsiveSection',
      visible: true,
      children: [
        {
          type: 'FRAME',
          name: 'MobileFrame',
          visible: true,
          width: 375,
          height: 200,
          children: [],
          layoutMode: 'VERTICAL',
        },
        {
          type: 'FRAME',
          name: 'DesktopFrame',
          visible: true,
          width: 1440,
          height: 200,
          children: [],
          layoutMode: 'HORIZONTAL',
        },
      ],
    }

    const result = await (
      figmaMock.codegen.on as ReturnType<typeof mock>
    ).mock.calls[0][1]({
      node: sectionNode,
      language: 'devup-ui',
    })

    expect(result).toMatchSnapshot()
  })
})

it('should not register codegen if figma is not defined', async () => {
  codeModule.run(undefined as unknown as typeof figma)
  expect(devupModule.exportDevup).not.toHaveBeenCalled()
  expect(devupModule.importDevup).not.toHaveBeenCalled()
  expect(exportAssetsModule.exportAssets).not.toHaveBeenCalled()
  expect(exportComponentsModule.exportComponents).not.toHaveBeenCalled()
})

it('should run command', async () => {
  const figmaMock = {
    editorType: 'figma',
    command: 'export-devup',
    closePlugin: mock(() => {}),
  } as unknown as typeof figma
  codeModule.run(figmaMock as typeof figma)
  expect(devupModule.exportDevup).toHaveBeenCalledWith('json')
  expect(devupModule.importDevup).not.toHaveBeenCalled()
  expect(exportAssetsModule.exportAssets).not.toHaveBeenCalled()
  expect(exportComponentsModule.exportComponents).not.toHaveBeenCalled()
})

it('auto-runs on module load when figma is present', async () => {
  const codegenOn = mock(() => {})
  ;(globalThis as { figma?: unknown }).figma = {
    editorType: 'dev',
    mode: 'codegen',
    command: 'noop',
    codegen: { on: codegenOn },
    closePlugin: mock(() => {}),
  } as unknown as typeof figma

  await import(`../code?with-figma=${Date.now()}`)

  expect(codegenOn).toHaveBeenCalledWith('generate', expect.any(Function))
})

describe('extractImports', () => {
  it('should extract keyframes import when code contains keyframes(', () => {
    const result = codeModule.extractImports([
      [
        'AnimatedBox',
        '<Box animationName={keyframes({ "0%": { opacity: 0 } })} />',
      ],
    ])
    expect(result).toContain('keyframes')
    expect(result).toContain('Box')
  })

  it('should extract keyframes import when code contains keyframes`', () => {
    const result = codeModule.extractImports([
      ['AnimatedBox', '<Box animationName={keyframes`from { opacity: 0 }`} />'],
    ])
    expect(result).toContain('keyframes')
    expect(result).toContain('Box')
  })

  it('should not extract keyframes when not present', () => {
    const result = codeModule.extractImports([
      ['SimpleBox', '<Box w="100px" />'],
    ])
    expect(result).not.toContain('keyframes')
    expect(result).toContain('Box')
  })
})

describe('extractCustomComponentImports', () => {
  it('should extract custom component imports', () => {
    const result = codeModule.extractCustomComponentImports([
      ['MyComponent', '<Box><CustomButton /><CustomInput /></Box>'],
    ])
    expect(result).toContain('CustomButton')
    expect(result).toContain('CustomInput')
    expect(result).not.toContain('Box')
    expect(result).not.toContain('MyComponent')
  })

  it('should not include devup-ui components', () => {
    const result = codeModule.extractCustomComponentImports([
      [
        'MyComponent',
        '<Box><Flex><VStack><CustomCard /></VStack></Flex></Box>',
      ],
    ])
    expect(result).toContain('CustomCard')
    expect(result).not.toContain('Box')
    expect(result).not.toContain('Flex')
    expect(result).not.toContain('VStack')
  })

  it('should return empty array when no custom components', () => {
    const result = codeModule.extractCustomComponentImports([
      ['MyComponent', '<Box><Flex><Text>Hello</Text></Flex></Box>'],
    ])
    expect(result).toEqual([])
  })

  it('should sort custom components alphabetically', () => {
    const result = codeModule.extractCustomComponentImports([
      ['MyComponent', '<Box><Zebra /><Apple /><Mango /></Box>'],
    ])
    expect(result).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('should handle multiple components with same custom component', () => {
    const result = codeModule.extractCustomComponentImports([
      ['ComponentA', '<Box><SharedButton /></Box>'],
      ['ComponentB', '<Flex><SharedButton /></Flex>'],
    ])
    expect(result).toEqual(['SharedButton'])
  })

  it('should handle nested custom components', () => {
    const result = codeModule.extractCustomComponentImports([
      ['Parent', '<Box><ChildA><ChildB><ChildC /></ChildB></ChildA></Box>'],
    ])
    expect(result).toContain('ChildA')
    expect(result).toContain('ChildB')
    expect(result).toContain('ChildC')
  })
})

describe('registerCodegen with viewport variant', () => {
  type CodegenHandler = (event: {
    node: SceneNode
    language: string
  }) => Promise<unknown[]>

  it('should generate responsive component codes for COMPONENT_SET with viewport variant', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    const componentSetNode = {
      type: 'COMPONENT_SET',
      name: 'ResponsiveButton',
      visible: true,
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      children: [
        {
          type: 'COMPONENT',
          name: 'viewport=mobile',
          visible: true,
          variantProperties: { viewport: 'mobile' },
          children: [],
          layoutMode: 'VERTICAL',
          width: 320,
          height: 100,
        },
        {
          type: 'COMPONENT',
          name: 'viewport=desktop',
          visible: true,
          variantProperties: { viewport: 'desktop' },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: 1200,
          height: 100,
        },
      ],
      defaultVariant: {
        type: 'COMPONENT',
        name: 'viewport=desktop',
        visible: true,
        variantProperties: { viewport: 'desktop' },
        children: [],
      },
    } as unknown as SceneNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: componentSetNode,
      language: 'devup-ui',
    })

    // Should include responsive components result
    const responsiveResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title.includes('Responsive'),
    )
    expect(responsiveResult).toBeDefined()
  })

  it('should generate responsive component with multiple variants (viewport + size)', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    // COMPONENT_SET with both viewport and size variants
    const componentSetNode = {
      type: 'COMPONENT_SET',
      name: 'ResponsiveButton',
      visible: true,
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
        size: {
          type: 'VARIANT',
          defaultValue: 'md',
          variantOptions: ['sm', 'md', 'lg'],
        },
      },
      children: [
        {
          type: 'COMPONENT',
          name: 'viewport=mobile, size=md',
          visible: true,
          variantProperties: { viewport: 'mobile', size: 'md' },
          children: [],
          layoutMode: 'VERTICAL',
          width: 320,
          height: 100,
        },
        {
          type: 'COMPONENT',
          name: 'viewport=desktop, size=md',
          visible: true,
          variantProperties: { viewport: 'desktop', size: 'md' },
          children: [],
          layoutMode: 'HORIZONTAL',
          width: 1200,
          height: 100,
        },
      ],
      defaultVariant: {
        type: 'COMPONENT',
        name: 'viewport=desktop, size=md',
        visible: true,
        variantProperties: { viewport: 'desktop', size: 'md' },
        children: [],
      },
    } as unknown as SceneNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: componentSetNode,
      language: 'devup-ui',
    })

    // Should include responsive components result
    const responsiveResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title.includes('Responsive'),
    )
    expect(responsiveResult).toBeDefined()

    // The generated code should include the size variant in the interface
    const resultWithCode = responsiveResult as { code: string } | undefined
    if (resultWithCode?.code) {
      expect(resultWithCode.code).toContain('size')
    }
  })

  it('should generate responsive code for node with parent SECTION', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    // Create a SECTION node with children of different widths
    const sectionNode = {
      type: 'SECTION',
      name: 'ResponsiveSection',
      visible: true,
      children: [
        {
          type: 'FRAME',
          name: 'MobileFrame',
          visible: true,
          width: 375,
          height: 200,
          children: [],
          layoutMode: 'VERTICAL',
        },
        {
          type: 'FRAME',
          name: 'DesktopFrame',
          visible: true,
          width: 1200,
          height: 200,
          children: [],
          layoutMode: 'HORIZONTAL',
        },
      ],
    }

    // Create a child node that has the SECTION as parent
    const childNode = {
      type: 'FRAME',
      name: 'ChildFrame',
      visible: true,
      width: 375,
      height: 100,
      children: [],
      layoutMode: 'VERTICAL',
      parent: sectionNode,
    } as unknown as SceneNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: childNode,
      language: 'devup-ui',
    })

    // Should include responsive result from parent section
    const responsiveResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title.includes('Responsive'),
    )
    expect(responsiveResult).toBeDefined()
  })

  it('should generate CLI with custom component imports', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    // Create a custom component that will be referenced
    const customComponent = {
      type: 'COMPONENT',
      name: 'CustomButton',
      visible: true,
      children: [],
      width: 100,
      height: 40,
      layoutMode: 'NONE',
      componentPropertyDefinitions: {},
      parent: null,
    }

    // Create an INSTANCE referencing the custom component
    const instanceNode = {
      type: 'INSTANCE',
      name: 'CustomButton',
      visible: true,
      width: 100,
      height: 40,
      getMainComponentAsync: async () => customComponent,
    }

    // Create a COMPONENT that contains the INSTANCE
    const componentNode = {
      type: 'COMPONENT',
      name: 'MyComponent',
      visible: true,
      children: [instanceNode],
      width: 200,
      height: 100,
      layoutMode: 'VERTICAL',
      componentPropertyDefinitions: {},
      reactions: [],
      parent: null,
    } as unknown as SceneNode

    // Create COMPONENT_SET parent with proper children array
    const componentSetNode = {
      type: 'COMPONENT_SET',
      name: 'MyComponentSet',
      componentPropertyDefinitions: {},
      children: [componentNode],
      defaultVariant: componentNode,
      reactions: [],
    }

    // Set parent reference
    ;(componentNode as { parent: unknown }).parent = componentSetNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: componentNode,
      language: 'devup-ui',
    })

    // Should include CLI outputs
    const bashCLI = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title.includes('CLI (Bash)'),
    )
    const powershellCLI = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title.includes('CLI (PowerShell)'),
    )

    expect(bashCLI).toBeDefined()
    expect(powershellCLI).toBeDefined()

    // Check that custom component import is included (bash escapes quotes)
    const bashCode = (bashCLI as { code: string } | undefined)?.code
    const powershellCode = (powershellCLI as { code: string } | undefined)?.code

    if (bashCode) {
      expect(bashCode).toContain(
        "import { CustomButton } from \\'@/components/CustomButton\\'",
      )
    }
    if (powershellCode) {
      expect(powershellCode).toContain(
        "import { CustomButton } from '@/components/CustomButton'",
      )
    }
  })

  it('should generate componentsResponsiveCodes when FRAME contains INSTANCE of COMPONENT_SET with viewport', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    // Create a COMPONENT_SET with viewport variants
    const componentSetNode = {
      type: 'COMPONENT_SET',
      name: 'ResponsiveButton',
      visible: true,
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
      children: [] as unknown[],
      defaultVariant: null as unknown,
    }

    // Create COMPONENT children for the COMPONENT_SET
    const mobileComponent = {
      type: 'COMPONENT',
      name: 'viewport=mobile',
      visible: true,
      variantProperties: { viewport: 'mobile' },
      children: [],
      layoutMode: 'VERTICAL',
      width: 320,
      height: 100,
      parent: componentSetNode,
      componentPropertyDefinitions: {},
      reactions: [],
    }

    const desktopComponent = {
      type: 'COMPONENT',
      name: 'viewport=desktop',
      visible: true,
      variantProperties: { viewport: 'desktop' },
      children: [],
      layoutMode: 'HORIZONTAL',
      width: 1200,
      height: 100,
      parent: componentSetNode,
      componentPropertyDefinitions: {},
      reactions: [],
    }

    componentSetNode.children = [mobileComponent, desktopComponent]
    componentSetNode.defaultVariant = desktopComponent

    // Create an INSTANCE that references the desktop component
    const instanceNode = {
      type: 'INSTANCE',
      name: 'ResponsiveButton',
      visible: true,
      width: 1200,
      height: 100,
      getMainComponentAsync: async () => desktopComponent,
    }

    // Create a FRAME that contains the INSTANCE
    const frameNode = {
      type: 'FRAME',
      name: 'MyFrame',
      visible: true,
      children: [instanceNode],
      width: 1400,
      height: 200,
      layoutMode: 'VERTICAL',
    } as unknown as SceneNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: frameNode,
      language: 'devup-ui',
    })

    // Should include Components Responsive results
    const responsiveResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title === 'MyFrame - Components Responsive',
    )
    expect(responsiveResult).toBeDefined()

    // Should also include CLI results for Components Responsive
    const bashCLI = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title ===
          'MyFrame - Components Responsive CLI (Bash)',
    )
    expect(bashCLI).toBeDefined()

    const powershellCLI = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title ===
          'MyFrame - Components Responsive CLI (PowerShell)',
    )
    expect(powershellCLI).toBeDefined()
  })
})

describe('generateComponentUsage', () => {
  it('should generate usage for COMPONENT without variant props', () => {
    const node = {
      type: 'COMPONENT',
      name: 'MyButton',
      variantProperties: null,
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton />')
  })

  it('should generate usage for COMPONENT with variant props', () => {
    const node = {
      type: 'COMPONENT',
      name: 'MyButton',
      variantProperties: { variant: 'primary', size: 'lg' },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton variant="primary" size="lg" />')
  })

  it('should filter reserved variant keys for COMPONENT', () => {
    const node = {
      type: 'COMPONENT',
      name: 'MyButton',
      variantProperties: {
        variant: 'primary',
        viewport: 'mobile',
        effect: 'hover',
      },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton variant="primary" />')
  })

  it('should generate usage for COMPONENT in COMPONENT_SET', () => {
    const componentSet = {
      type: 'COMPONENT_SET',
      name: 'ButtonSet',
    }
    const node = {
      type: 'COMPONENT',
      name: 'variant=primary, size=lg',
      variantProperties: { variant: 'primary', size: 'lg' },
      parent: componentSet,
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<ButtonSet variant="primary" size="lg" />')
  })

  it('should generate usage for COMPONENT_SET with defaults', () => {
    const node = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: {
        variant: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: ['primary', 'secondary'],
        },
        size: {
          type: 'VARIANT',
          defaultValue: 'md',
          variantOptions: ['sm', 'md', 'lg'],
        },
      },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton variant="primary" size="md" />')
  })

  it('should filter reserved variant keys for COMPONENT_SET', () => {
    const node = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: {
        variant: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: ['primary', 'secondary'],
        },
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton variant="primary" />')
  })

  it('should sanitize COMPONENT_SET property names with hash suffixes', () => {
    const node = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: {
        'variant#123:456': {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: ['primary', 'secondary'],
        },
      },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton variant="primary" />')
  })

  it('should skip non-VARIANT properties for COMPONENT_SET', () => {
    const node = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: {
        variant: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: ['primary', 'secondary'],
        },
        hasIcon: {
          type: 'BOOLEAN',
          defaultValue: true,
        },
        icon: {
          type: 'INSTANCE_SWAP',
          defaultValue: 'some-id',
        },
      },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton variant="primary" />')
  })

  it('should generate usage for COMPONENT_SET without componentPropertyDefinitions', () => {
    const node = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: undefined,
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton />')
  })

  it('should return null for non-component nodes', () => {
    const node = {
      type: 'FRAME',
      name: 'MyFrame',
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBeNull()
  })

  it('should generate usage with no props when COMPONENT_SET has only reserved variants', () => {
    const node = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: {
        viewport: {
          type: 'VARIANT',
          defaultValue: 'desktop',
          variantOptions: ['mobile', 'desktop'],
        },
      },
    } as unknown as SceneNode

    const result = codeModule.generateComponentUsage(node)
    expect(result).toBe('<MyButton />')
  })
})

describe('registerCodegen with usage output', () => {
  type CodegenHandler = (event: {
    node: SceneNode
    language: string
  }) => Promise<unknown[]>

  it('should generate usage for INSTANCE node', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    const mainComponent = {
      type: 'COMPONENT',
      name: 'PrimaryButton',
      children: [],
      visible: true,
    } as unknown as ComponentNode

    const instanceNode = {
      type: 'INSTANCE',
      name: 'PrimaryButton',
      visible: true,
      componentProperties: {
        'variant#123:456': { type: 'VARIANT', value: 'primary' },
        'size#789:012': { type: 'VARIANT', value: 'lg' },
      },
      getMainComponentAsync: async () => mainComponent,
    } as unknown as SceneNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: instanceNode,
      language: 'devup-ui',
    })

    const usageResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title === 'Usage',
    )
    expect(usageResult).toBeDefined()

    const usageCode = (usageResult as { code: string }).code
    expect(usageCode).toContain('<PrimaryButton')
    expect(usageCode).toContain('variant="primary"')
    expect(usageCode).toContain('size="lg"')
  })

  it('should generate usage for positioned INSTANCE node (absolute)', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    const mainComponent = {
      type: 'COMPONENT',
      name: 'AbsButton',
      children: [],
      visible: true,
    } as unknown as ComponentNode

    const parent = {
      type: 'FRAME',
      name: 'Parent',
      children: [] as unknown[],
      visible: true,
      width: 500,
    }

    const instanceNode = {
      type: 'INSTANCE',
      name: 'AbsButton',
      visible: true,
      width: 100,
      height: 50,
      x: 10,
      y: 20,
      layoutPositioning: 'ABSOLUTE',
      constraints: {
        horizontal: 'MIN',
        vertical: 'MIN',
      },
      componentProperties: {
        'variant#1:2': { type: 'VARIANT', value: 'secondary' },
      },
      getMainComponentAsync: async () => mainComponent,
      parent,
    } as unknown as SceneNode

    parent.children = [instanceNode]

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: instanceNode,
      language: 'devup-ui',
    })

    const usageResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title === 'Usage',
    )
    expect(usageResult).toBeDefined()

    const usageCode = (usageResult as { code: string }).code
    // Should show clean component usage without position wrapper
    expect(usageCode).toContain('<AbsButton')
    expect(usageCode).toContain('variant="secondary"')
    expect(usageCode).not.toContain('pos=')
  })

  it('should generate usage for COMPONENT node', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    const componentSetNode = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      componentPropertyDefinitions: {},
      children: [] as unknown[],
      defaultVariant: null as unknown,
    }

    const componentNode = {
      type: 'COMPONENT',
      name: 'variant=primary',
      visible: true,
      variantProperties: { variant: 'primary' },
      children: [],
      width: 100,
      height: 40,
      layoutMode: 'NONE',
      componentPropertyDefinitions: {},
      parent: componentSetNode,
      reactions: [],
    } as unknown as SceneNode

    componentSetNode.children = [componentNode]
    componentSetNode.defaultVariant = componentNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: componentNode,
      language: 'devup-ui',
    })

    const usageResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title === 'Usage',
    )
    expect(usageResult).toBeDefined()

    const usageCode = (usageResult as { code: string }).code
    expect(usageCode).toBe('<MyButton variant="primary" />')
  })

  it('should generate usage for COMPONENT_SET node', async () => {
    let capturedHandler: CodegenHandler | null = null

    const figmaMock = {
      editorType: 'dev',
      mode: 'codegen',
      command: 'noop',
      codegen: {
        on: (_event: string, handler: CodegenHandler) => {
          capturedHandler = handler
        },
      },
      closePlugin: mock(() => {}),
    } as unknown as typeof figma

    codeModule.registerCodegen(figmaMock)

    expect(capturedHandler).not.toBeNull()
    if (capturedHandler === null) throw new Error('Handler not captured')

    const componentSetNode = {
      type: 'COMPONENT_SET',
      name: 'MyButton',
      visible: true,
      componentPropertyDefinitions: {
        variant: {
          type: 'VARIANT',
          defaultValue: 'primary',
          variantOptions: ['primary', 'secondary'],
        },
        size: {
          type: 'VARIANT',
          defaultValue: 'md',
          variantOptions: ['sm', 'md', 'lg'],
        },
      },
      children: [
        {
          type: 'COMPONENT',
          name: 'variant=primary, size=md',
          visible: true,
          variantProperties: { variant: 'primary', size: 'md' },
          children: [],
          layoutMode: 'VERTICAL',
          width: 100,
          height: 40,
        },
      ],
      defaultVariant: {
        type: 'COMPONENT',
        name: 'variant=primary, size=md',
        visible: true,
        variantProperties: { variant: 'primary', size: 'md' },
        children: [],
      },
    } as unknown as SceneNode

    const handler = capturedHandler as CodegenHandler
    const result = await handler({
      node: componentSetNode,
      language: 'devup-ui',
    })

    const usageResult = result.find(
      (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        'title' in r &&
        (r as { title: string }).title === 'Usage',
    )
    expect(usageResult).toBeDefined()

    const usageCode = (usageResult as { code: string }).code
    expect(usageCode).toBe('<MyButton variant="primary" size="md" />')
  })
})
