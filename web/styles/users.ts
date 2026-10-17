import { css } from '../../styled-system/css'

export const filter = css({
  width: '100%',
  padding: 'sm',
  border: '1px solid',
  borderColor: 'border',
  borderRadius: 'md',
  font: 'inherit',
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }
})

export const muted = css({ color: 'muted', fontSize: '0.875rem' })

export const list = css({ listStyle: 'none', margin: 0, padding: 0 })

export const row = css({
  display: 'flex',
  flexDirection: 'column',
  gap: 'xs',
  padding: 'sm 0',
  borderBottom: '1px solid',
  borderColor: 'border'
})

export const pager = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'sm',
  paddingTop: 'sm',
  color: 'muted',
  fontSize: '0.875rem'
})

export const pagerLink = css({
  color: 'accent',
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }
})
