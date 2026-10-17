import { css } from '../../../styled-system/css'

/** Page ground: warm paper, ink text, comfortable body leading. */
export const body = css({
  backgroundColor: 'paper',
  color: 'text',
  fontFamily: 'body',
  lineHeight: '1.6',
  textRendering: 'optimizeLegibility',
  fontSmoothing: 'antialiased'
})

export const header = css({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  maxWidth: '46rem',
  marginInline: 'auto',
  padding: 'lg xl',
  borderBottom: '1px solid',
  borderColor: 'line'
})

export const brand = css({
  fontFamily: 'display',
  fontSize: '1.25rem',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'inherit',
  textDecoration: 'none'
})

export const nav = css({ display: 'flex', gap: 'md' })

export const main = css({
  maxWidth: '46rem',
  marginInline: 'auto',
  padding: '3.5rem lg 4.5rem'
})
