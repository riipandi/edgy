import { css } from '../../styled-system/css'

export const intro = css({
  fontFamily: 'display',
  fontSize: '1.5rem',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1.2,
  margin: '0 0 md'
})

export const filter = css({
  width: '100%',
  padding: 'sm md',
  font: 'inherit',
  fontSize: '1rem',
  color: 'text',
  backgroundColor: 'transparent',
  border: '1px solid',
  borderColor: 'line',
  borderRadius: '8px',
  _hover: { borderColor: 'muted' },
  _focusVisible: {
    outline: '2px solid',
    outlineColor: 'accent',
    outlineOffset: '1px',
    borderColor: 'transparent'
  },
  _placeholder: { color: 'muted' }
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

export const pagerLink = css({
  color: 'accent',
  textDecoration: 'none',
  _hover: { textDecoration: 'underline' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }
})
