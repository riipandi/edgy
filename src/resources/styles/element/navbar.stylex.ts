// Navbar (app shell nav) styles.
import * as stylex from '@stylexjs/stylex'
import { colors } from '#/resources/styles/core/colors.stylex.ts'
import { duration, fontWeight, radius, spacing } from '#/resources/styles/core/tokens.stylex.ts'

export const styles = stylex.create({
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.hairline,
    padding: spacing.medium,
    backgroundColor: colors.backgroundNav
  },
  link: {
    display: 'inline-block',
    padding: spacing.tight,
    borderRadius: radius.medium,
    color: {
      default: colors.foregroundNavLink,
      ':hover': colors.foregroundNavLinkHover
    },
    backgroundColor: {
      default: null,
      ':hover': colors.backgroundNavLinkHover
    },
    fontWeight: fontWeight.semibold,
    textDecoration: 'none',
    transition: `background-color ${duration.fast} ease, color ${duration.fast} ease`
  },
  linkActive: {
    color: colors.foregroundNavLinkActive,
    backgroundColor: colors.backgroundNavLinkActive
  }
})
