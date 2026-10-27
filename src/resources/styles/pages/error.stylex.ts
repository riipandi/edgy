// Error page styles.
import * as stylex from '@stylexjs/stylex'
import { fontSize, spacing } from '#/resources/styles/core/tokens.stylex.ts'

export const styles = stylex.create({
  message: {
    fontSize: fontSize.body,
    marginTop: '0.5rem'
  },
  actions: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.medium,
    marginTop: spacing.medium
  },
  button: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    font: 'inherit',
    padding: 0,
    textAlign: 'left'
  }
})
