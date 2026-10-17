import { pandacss } from '@pandacss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Tests import `.css.ts` styles, which only Vite can load.
  plugins: [pandacss()],
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
      }
    ]
  }
})
