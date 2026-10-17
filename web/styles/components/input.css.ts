import { css } from '../../../styled-system/css'

/** Single-line text input: hairline border, quiet placeholder, visible focus. */
export const input = css({
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
