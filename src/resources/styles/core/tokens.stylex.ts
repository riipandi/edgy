// Layout, typography, and motion tokens.
import * as stylex from '@stylexjs/stylex'

export const breakpoints = stylex.defineConsts({
  small: '@media (max-width: 600px)',
  medium: '@media (min-width: 601px) and (max-width: 1024px)',
  large: '@media (min-width: 1025px)'
})

export const spacing = stylex.defineConsts({
  none: '0',
  hairline: '0.125rem',
  tight: '0.4rem 0.75rem',
  small: '0.5rem 1.5rem',
  medium: '1rem',
  large: '3rem 1rem'
})

export const radius = stylex.defineConsts({
  none: '0',
  small: '0.375rem',
  medium: '0.5rem',
  large: '0.75rem',
  full: '999px'
})

export const fontSize = stylex.defineConsts({
  h1: 'clamp(1.75rem, 4vw, 2.5rem)',
  h2: '1.5rem',
  body: '1rem',
  small: '0.875rem'
})

export const fontWeight = stylex.defineConsts({
  regular: 400,
  semibold: 600,
  bold: 700
})

export const duration = stylex.defineConsts({
  fast: '150ms',
  medium: '200ms',
  slow: '300ms'
})
