import { pandacss } from '@pandacss/vite'
import solidPlugin from '@solidjs/vite-plugin'
import { fileRoutes as fsRouting } from 'filesystem-routing/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The router package ships `.jsx` (its `solid` export condition) that this config's tsconfig
  // does not include; without an explicit source, Vite's transform would inject React's runtime.
  oxc: { jsx: { runtime: 'automatic', importSource: '@solidjs/web' } },
  // Tests import `.tsx` components and `.css.ts` styles, which only Vite can load.
  plugins: [
    fsRouting({ dir: 'src/pages', codeSplitting: false }),
    solidPlugin({
      ssr: true,
      include: ['src/**/*.{tsx,ts}', '**/node_modules/@solidjs/router/dist/**/*.jsx']
    }),
    pandacss()
  ],
  test: {
    // The router package ships `.jsx` source (`solid` condition) that only the Solid transform
    // can parse — inline it so it goes through the plugin instead of Node's import.
    server: { deps: { inline: [/@solidjs\/router/] } },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: '.output/tests-results/coverage'
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        extends: true,
        resolve: { conditions: ['browser'] },
        test: {
          name: 'components',
          include: ['src/pages/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['./tests/components_setup.ts']
        }
      }
    ]
  }
})
