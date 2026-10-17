import { css } from '../../../styled-system/css'

/** Display headline: serif, tight leading and tracking, sized for the page's voice. */
export const display = css({
  fontFamily: 'display',
  fontSize: 'clamp(2.25rem, 5vw, 3.25rem)',
  fontWeight: 600,
  lineHeight: 1.08,
  letterSpacing: '-0.02em',
  margin: 0,
  textWrap: 'balance'
})

/** One-sentence sans lead under the display. */
export const lead = css({
  fontSize: '1.125rem',
  lineHeight: 1.6,
  color: 'text',
  margin: 'md 0 0',
  maxWidth: '38rem'
})

/** Quiet supporting line; the accent reaches only its links. */
export const detail = css({
  color: 'muted',
  margin: 'lg 0 0',
  paddingTop: 'md',
  borderTop: '1px solid',
  borderTopColor: 'line'
})

/** Small data voice: ids, request references, numbers. */
export const code = css({ fontFamily: 'data', fontSize: '0.875em' })

/** Printed-correction status figure on the error page. */
export const status = css({
  fontFamily: 'display',
  margin: 0,
  fontSize: 'clamp(3.5rem, 8vw, 5rem)',
  lineHeight: 1,
  fontWeight: 600,
  letterSpacing: '-0.02em',
  color: 'accent'
})
