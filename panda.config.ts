import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  include: ['./web/**/*.{js,ts}'],
  exclude: [],
  theme: {
    extend: {
      semanticTokens: {
        colors: {
          text: { value: '#1b1b1f' },
          muted: { value: '#5d5d66' },
          surface: { value: '#ffffff' },
          border: { value: '#dcdce3' },
          accent: { value: '#2457f5' }
        },
        spacing: {
          xs: { value: '0.25rem' },
          sm: { value: '0.5rem' },
          md: { value: '1rem' },
          lg: { value: '2rem' }
        },
        radius: { md: { value: '0.5rem' } },
        fonts: { body: { value: 'system-ui, -apple-system, "Segoe UI", sans-serif' } }
      }
    }
  },
  outdir: 'styled-system',
  preflight: true
})
