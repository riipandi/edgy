import solid from '@solidjs/vite-plugin'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import stylex from '@stylexjs/unplugin/vite'
import solidLint from 'eslint-plugin-solid/configs/v2'
import { fileRoutes } from 'filesystem-routing/vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'
import { effectVite } from './src/builder/vite-plugin.ts'

// Storybook and Vitest render components in the browser. The app server
// (start + SSR + file routes) stays on for `vite` and `vite build`.
const uiPreview = !!process.env.VITEST || process.argv.some((arg) => arg.includes('storybook'))

const ignoredPatterns = [
  '.output',
  '.storage',
  '.wrangler',
  '**/*.yml',
  '**/*.yaml',
  '**/*.toml',
  '**/*.gen.*',
  '/storage/**'
]

export default defineConfig(({ mode }) => ({
  staged: {
    '*.{ts,tsx,js,jsx,css,json}': 'vp check --fix'
  },
  fmt: {
    endOfLine: 'lf',
    useTabs: false,
    tabWidth: 2,
    printWidth: 100,
    insertFinalNewline: true,
    jsxSingleQuote: true,
    singleQuote: true,
    semi: false,
    bracketSpacing: true,
    trailingComma: 'none',
    overrides: [
      {
        files: ['*.json', '*.jsonc'],
        options: { tabWidth: 4 }
      }
    ],
    sortImports: {
      order: 'asc',
      groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index']],
      internalPattern: ['#/', '$/'],
      partitionByComment: false,
      partitionByNewline: false,
      newlinesBetween: false,
      ignoreCase: true
    },
    sortPackageJson: {
      sortScripts: false
    },
    ignorePatterns: ignoredPatterns
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }, 'eslint-plugin-solid'],
    plugins: ['import', 'unicorn', 'oxc', 'typescript'],
    settings: solidLint.settings,
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'import/extensions': [
        'error',
        'ignorePackages',
        { pattern: { ts: 'always', tsx: 'always' } }
      ],
      ...solidLint.rules
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ignoredPatterns
  },
  plugins:
    lazyPlugins(() => [
      stylex({
        aliases: { '#/*': resolve('./src/*') },
        enableDevClassNames: mode === 'development',
        useCSSLayers: { before: ['reset'], prefix: 'stylex' },
        lightningcssOptions: { minify: mode !== 'development' }
      }),
      solid({
        diagnostics: false,
        extensions: ['.jsx', '.tsx'],
        ...(uiPreview ? {} : { start: true, ssr: true })
      }),
      uiPreview ? null : fileRoutes({ types: true }),
      effectVite({ enabled: !uiPreview })
    ]) ?? [],
  ssr: { noExternal: true },
  resolve: { tsconfigPaths: true },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: { assetsInlineLimit: 0, target: 'esnext' },
  test: {
    coverage: {
      provider: 'v8',
      reportsDirectory: '.output/coverage',
      reporter: ['text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.d.ts', '**/*.stories.tsx']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./vitest-setup.ts'],
          globals: false,
          isolate: false
        }
      },
      {
        extends: false,
        plugins: [
          stylex({
            aliases: { '#/*': resolve('./src/*') },
            enableDevClassNames: mode === 'development',
            useCSSLayers: { before: ['reset'], prefix: 'stylex' },
            lightningcssOptions: { minify: mode !== 'development' }
          }),
          solid({ diagnostics: false, extensions: ['.jsx', '.tsx'] }),
          storybookTest({
            configDir: fileURLToPath(new URL('./.storybook', import.meta.url)),
            storybookScript: 'vpr storybook'
          }),
          {
            name: 'solid-storybook-deps',
            enforce: 'post',
            config(config) {
              config.optimizeDeps ??= {}
              const include = (config.optimizeDeps.include ?? []).filter(
                (id) => !id.startsWith('solid-js/') && !id.startsWith('react')
              )
              include.push('solid-js/refresh')
              config.optimizeDeps.include = include
            }
          }
        ],
        resolve: {
          alias: [
            {
              find: 'storybook-solidjs-vite/renderer/solid-legacy',
              replacement: 'storybook-solidjs-vite/renderer/solid-next'
            }
          ]
        },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }]
          },
          setupFiles: ['./.storybook/vitest.setup.ts']
        }
      }
    ]
  }
}))
