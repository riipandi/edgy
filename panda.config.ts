import { defineConfig } from '@pandacss/dev'

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
  preflight: true,
  include: ['./src/pages/**/*.{js,ts,tsx}', './src/styles/**/*.{js,ts,tsx}'],
  exclude: [],
  theme: {
    extend: {
      semanticTokens: {
        colors: {
          paper: { value: '#faf9f7' },
          text: { value: '#1c1a17' },
          muted: { value: '#6f6a61' },
          line: { value: '#e7e4de' },
          accent: { value: '#2451b3' }
        },
        spacing: {
          xs: { value: '0.25rem' },
          sm: { value: '0.5rem' },
          md: { value: '1rem' },
          lg: { value: '2rem' },
          xl: { value: '3.5rem' }
        },
        fonts: {
          display: { value: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
          body: { value: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
          data: { value: 'ui-monospace, SFMono-Regular, Menlo, monospace' }
        }
      }
    }
  },
  outdir: 'styled-system'
})
