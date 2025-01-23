import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/**/types.ts', 'src/**/__tests__'],
    },
    globals: true,
  },
})
