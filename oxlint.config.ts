import solid from 'eslint-plugin-solid/configs/v2'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['eslint-plugin-solid'],
  settings: solid.settings,
  rules: solid.rules,
  ignorePatterns: [
    '.output',
    '.storage',
    '.wrangler',
    '**/*.md',
    '**/*.mdx',
    '**/*.yml',
    '**/*.yaml',
    '**/*.toml',
    '**/*.gen.*',
    '/storage/**'
  ]
})
