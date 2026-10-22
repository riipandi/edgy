import solid from '@solidjs/vite-plugin'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import stylex from '@stylexjs/unplugin/vite'
import { globSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestProjectConfiguration } from 'vite-plus'
import { playwright } from 'vite-plus/test/browser-playwright'

const hasStoryFiles =
  globSync('src/**/*.stories.tsx', { cwd: fileURLToPath(new URL('.', import.meta.url)) }).length > 0

export const storybookProject = (mode: string): TestProjectConfiguration => {
  if (!hasStoryFiles) {
    return {
      extends: false,
      test: {
        name: 'storybook',
        include: ['src/**/*.stories.tsx']
      }
    }
  }

  return {
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
}
