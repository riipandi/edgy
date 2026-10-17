import { css } from '../../../styled-system/css'

/** Primary action: accent fill, white label. */
export const button = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'sm',
  padding: 'sm md',
  font: 'inherit',
  fontSize: '0.9375rem',
  fontWeight: 600,
  color: '#ffffff',
  backgroundColor: 'accent',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  _hover: { backgroundColor: 'accent/90' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' },
  _active: { transform: 'scale(0.98)' }
})

/** Secondary action: hairline outline on the paper ground. */
export const buttonGhost = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'sm',
  padding: 'sm md',
  font: 'inherit',
  fontSize: '0.9375rem',
  fontWeight: 600,
  color: 'text',
  backgroundColor: 'transparent',
  border: '1px solid',
  borderColor: 'line',
  borderRadius: '8px',
  cursor: 'pointer',
  _hover: { borderColor: 'muted' },
  _focusVisible: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' },
  _active: { transform: 'scale(0.98)' }
})
