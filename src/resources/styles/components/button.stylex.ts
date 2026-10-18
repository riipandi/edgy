// Button component styles: a solid-accent recipe for actions.
import * as stylex from '@stylexjs/stylex'
import { colors } from '../core/colors.stylex'
import { duration, fontWeight, radius, spacing } from '../core/tokens.stylex'

export const styles = stylex.create({
  base: {
    fontSize: '1rem',
    padding: spacing.small,
    borderRadius: radius.medium,
    fontWeight: fontWeight.semibold,
    color: colors.foregroundNavLinkActive,
    backgroundColor: colors.focusRing,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':disabled': 'not-allowed'
    },
    transition: `filter ${duration.fast} ease, transform ${duration.fast} ease`,
    ':hover': {
      filter: 'brightness(1.08)'
    },
    ':active': {
      transform: 'scale(0.98)'
    }
  }
})
