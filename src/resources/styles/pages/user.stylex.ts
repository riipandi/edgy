// Users pages styles (list, detail, and the section layout).
import * as stylex from '@stylexjs/stylex'
import { colors } from '#/resources/styles/core/colors.stylex'
import { duration, radius, spacing } from '#/resources/styles/core/tokens.stylex'

export const styles = stylex.create({
  layout: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.medium,
    width: '100%'
  },
  card: {
    padding: '1.5rem',
    borderRadius: radius.large,
    backgroundColor: colors.backgroundCard,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colors.borderSubtle,
    width: '100%'
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.hairline,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    textAlign: 'left'
  },
  listLink: {
    display: 'block',
    padding: spacing.tight,
    borderRadius: radius.medium,
    color: {
      default: colors.foregroundLink,
      ':hover': colors.foregroundLinkHover
    },
    backgroundColor: {
      default: null,
      ':hover': colors.backgroundCode
    },
    fontWeight: 600,
    textDecoration: 'none',
    transition: `background-color ${duration.fast} ease, color ${duration.fast} ease`
  },
  detailSection: {
    transition: `opacity ${duration.fast} ease`
  },
  detailTitle: {
    margin: 0
  },
  detailBack: {
    marginTop: spacing.medium,
    display: 'inline-block'
  }
})
