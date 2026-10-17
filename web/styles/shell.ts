import { css } from '../../styled-system/css'

export const body = css({
  backgroundColor: 'surface',
  color: 'text',
  fontFamily: 'body',
  lineHeight: '1.5'
})

export const header = css({
  display: 'flex',
  alignItems: 'baseline',
  gap: 'lg',
  borderBottom: '1px solid',
  borderColor: 'border',
  padding: 'md lg'
})

export const brand = css({ fontWeight: 600, color: 'inherit', textDecoration: 'none' })

export const nav = css({ display: 'flex', gap: 'md' })

export const link = css({
  color: 'accent',
  textDecoration: 'none',
  _hover: { textDecoration: 'underline' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }
})

export const main = css({ marginInline: 'auto', maxWidth: '48rem', padding: 'lg' })
