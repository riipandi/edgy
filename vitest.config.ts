import marko from '@marko/vite'
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The pages under test import `.marko` templates and `.css.ts` styles, which only Vite can load.
  plugins: [marko(), vanillaExtractPlugin()],
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node'
  }
})
