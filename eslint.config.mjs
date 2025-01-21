import { fixupPluginRules } from '@eslint/compat'
import a from '@figma/eslint-plugin-figma-plugins'
import { configs } from 'eslint-plugin-devup'

export default [
  ...configs.recommended,
  {
    ...a.configs.recommended,
    plugins: {
      '@figma/figma-plugins': {
        rules: fixupPluginRules(a.rules),
      },
    },
  },
]
