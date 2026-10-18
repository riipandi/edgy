import solid from '@solidjs/vite-plugin'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import stylex from '@stylexjs/unplugin/vite'
import { playwright } from '@vitest/browser-playwright'
import { fileRoutes } from 'filesystem-routing/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { effectServer } from './src/builder/vite-plugin.ts'

// Storybook and Vitest render components in the browser. The app server
// (start + SSR + file routes) stays on for `vite` and `vite build`.
const uiPreview = !!process.env.VITEST || process.argv.some((arg) => arg.includes('storybook'))

export default defineConfig(({ mode }) => ({
  plugins: [
    stylex({
      enableDevClassNames: mode === 'development',
      useCSSLayers: { before: ['reset'], prefix: 'stylex' }
    }),
    effectServer({ enabled: !uiPreview }),
    solid({
      diagnostics: false,
      extensions: ['.jsx', '.tsx'],
      ...(uiPreview ? {} : { start: true, ssr: true })
    }),
    uiPreview ? null : fileRoutes({ types: true })
  ],
  ssr: { noExternal: true },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  build: {
    assetsInlineLimit: 0,
    target: 'esnext'
  },
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
          solid({ diagnostics: false, extensions: ['.jsx', '.tsx'] }),
          storybookTest({
            configDir: fileURLToPath(new URL('./.storybook', import.meta.url)),
            storybookScript: 'pnpm storybook'
          }),
          {
            name: 'solid-2-storybook-deps',
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
