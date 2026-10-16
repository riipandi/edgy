import marko from '@marko/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Tests import `.marko` templates and `.css.ts` styles, which only Vite can load.
  plugins: [marko(), vanillaExtractPlugin()],
  test: {
    name: 'unit',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: '.output/tests-results/coverage'
    }
  }
})
