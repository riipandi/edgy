import stylex from '@stylexjs/unplugin/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { resolve } from 'node:path'
import devtoolsJson from 'vite-plugin-devtools-json'
import { defineConfig, lazyPlugins } from 'vite-plus'
import { storybookProject } from './.storybook/vitest-integration.ts'
import { effectVite } from './src/builder/vite-plugin.ts'

const ignoredPatterns = [
  '.output',
  '.storage',
  '.wrangler',
  '.llms/**', // the documentation ledger wraps at full width; not formatter-owned
  '**/*.yml',
  '**/*.yaml',
  '**/*.toml',
  '**/*.gen.*',
  '/storage/**'
]

const isStorybook = process.argv.some((arg) => arg.includes('storybook'))
const uiPreview = !!process.env.VITEST || isStorybook

const stylexPlugin = (enable: boolean, mode: string) => {
  return enable
    ? stylex({
        aliases: { '#/*': resolve('./src/*') },
        enableDevClassNames: mode === 'development',
        useCSSLayers: { before: ['reset'], prefix: 'stylex' },
        lightningcssOptions: { minify: mode !== 'development' }
      })
    : null
}

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
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    plugins: ['import', 'unicorn', 'oxc', 'typescript'],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'import/extensions': ['error', 'ignorePackages', { pattern: { ts: 'always', tsx: 'always' } }]
    },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ignoredPatterns
  },
  plugins:
    lazyPlugins(() => [
      stylexPlugin(!uiPreview, mode),
      tanstackStart({
        router: {
          // routesDirectory resolves against srcDirectory (src); the
          // generated tree resolves against the project root.
          routesDirectory: 'routes',
          generatedRouteTree: 'src/routeTree.gen.ts'
        },
        // Start's dev middleware must stay installed for page rendering, but it
        // only sees requests the earlier Effect middleware passes through.
        vite: { installDevServerMiddleware: true },
        // Route files read the page-response helpers through the isomorphic
        // server entry; the client build receives Start's mock for them.
        importProtection: { behavior: { build: 'mock' } }
      }),
      effectVite({ enabled: !uiPreview }),
      devtoolsJson()
    ]) ?? [],
  resolve: { tsconfigPaths: true },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1024 * 4,
    target: 'esnext'
  },
  test: {
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reportsDirectory: '.output/coverage',
      reporter: ['text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['**/*.d.ts', '**/*.stories.tsx', 'src/resources/**', 'src/main.ts']
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          globals: false,
          isolate: false
        }
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          globals: false,
          isolate: false
        }
      },
      storybookProject(mode)
    ]
  }
}))
