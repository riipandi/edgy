import { css, cx } from '../../../styled-system/css'

/** Text link in the accent color; underline only on hover, focus ring for keyboard. */
export const link = css({
  color: 'accent',
  textDecoration: 'none',
  _hover: { textDecoration: 'underline', textUnderlineOffset: '3px' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }
})

/** Quiet link for secondary navigation; the accent arrives on hover. */
export const navLink = css({
  fontSize: '0.9375rem',
  color: 'muted',
  textDecoration: 'none',
  _hover: { color: 'accent' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' }
})

/** Pager link: the text link at pager size. */
export const pagerLink = cx(link, css({ fontSize: '0.875rem' }))
