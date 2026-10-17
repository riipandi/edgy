import { css } from '../../../styled-system/css'

/** Page intro heading: smaller than the home display, still serif. */
export const intro = css({
  fontFamily: 'display',
  fontSize: '1.5rem',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1.2,
  margin: '0 0 md'
})

export const muted = css({ color: 'muted', fontSize: '0.875rem' })

export const list = css({ listStyle: 'none', margin: 'md 0 0', padding: 0 })

export const row = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'xs',
  padding: 'md 0',
  borderBottom: '1px solid',
  borderBottomColor: 'line',
  _first: { borderTop: '1px solid', borderTopColor: 'line' }
})

export const name = css({ fontWeight: 600 })

export const email = css({ fontFamily: 'data', fontSize: '0.875rem', color: 'muted' })

export const pager = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'sm',
  paddingTop: 'lg',
  color: 'muted',
  fontSize: '0.875rem'
})
