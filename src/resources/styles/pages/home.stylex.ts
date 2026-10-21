// Home page styles.
import * as stylex from '@stylexjs/stylex'
import { colors } from '#/resources/styles/core/colors.stylex'
import { duration, radius, spacing } from '#/resources/styles/core/tokens.stylex'

export const styles = stylex.create({
  logo: {
    animation: 'logo-spin 20s linear infinite',
    height: '24vmin',
    marginInline: 'auto',
    pointerEvents: 'none'
  },
  lead: {
    color: {
      default: colors.foregroundMuted,
      ':hover': colors.foregroundLink
    },
    transition: `color ${duration.fast} ease`
  },
  edit: {
    margin: `${spacing.medium} auto`,
    padding: '0.5rem 0.75rem',
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundCard,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colors.borderSubtle,
    display: 'inline-block',
    fontSize: '0.875rem',
    color: colors.foregroundMuted
  },
  code: {
    color: colors.accentCode,
    backgroundColor: colors.backgroundCode,
    borderRadius: radius.small,
    padding: '0.1em 0.35em',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: '0.9em'
  }
})
