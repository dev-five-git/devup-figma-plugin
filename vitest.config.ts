import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/types', 'src/**/__tests__'],
    },
    globals: true,
  },
})
