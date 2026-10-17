import { pandacss } from '@pandacss/vite'
import solidPlugin from '@solidjs/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Tests import `.tsx` components and `.css.ts` styles, which only Vite can load.
  plugins: [
    solidPlugin({ ssr: true, include: ['src/**/*.{tsx,ts}', 'web/**/*.{tsx,ts}'] }),
    pandacss()
  ],
  test: {
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
          include: ['web/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['./tests/components_setup.ts']
        }
      }
    ]
  }
})
