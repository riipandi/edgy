import marko from '@marko/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { defineConfig, defineProject } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: '.output/tests-results/coverage'
    },
    projects: [
      defineProject({
        // Tests import `.marko` templates and `.css.ts` styles, which only Vite can load.
        plugins: [marko(), vanillaExtractPlugin()],
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
          environment: 'node'
        }
      }),
      defineProject({
        // Real browsers against the production build; see `e2e/fixtures/server.ts`.
        test: {
          name: 'e2e',
          include: ['e2e/**/*.spec.ts'],
          environment: 'node',
          globalSetup: ['e2e/fixtures/server.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000
        }
      })
    ]
  }
})
