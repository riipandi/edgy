import { createTheme, globalStyle } from '@vanilla-extract/css'

/**
 * Design tokens. The theme class is set on `<html>`, so every `var(...)` resolves page-wide.
 * Another theme is another `createTheme` call with the same shape.
 */
export const [themeClass, vars] = createTheme({
  color: {
    text: '#1b1b1f',
    muted: '#5d5d66',
    surface: '#ffffff',
    border: '#dcdce3',
    accent: '#2457f5'
  },
  space: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '2rem' },
  radius: { md: '0.5rem' },
  font: { body: 'system-ui, -apple-system, "Segoe UI", sans-serif' }
})

globalStyle('*, *::before, *::after', { boxSizing: 'border-box' })
globalStyle('body', { margin: 0 })
