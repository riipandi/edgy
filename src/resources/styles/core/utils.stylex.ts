import * as stylex from '@stylexjs/stylex'
import { colors } from './colors.stylex.ts'
import { breakpoints, duration, fontSize, fontWeight, radius, spacing } from './tokens.stylex.ts'

/**
 * Shared style fragments composed by elements, components, and pages.
 * Compose shared styles BEFORE the local style so local values win:
 *   {...sx(fx.main, styles.local)}
 */
export const fx = stylex.create({
  container: {
    width: '100%',
    boxSizing: 'border-box',
    marginInline: 'auto',
    maxWidth: '64rem',
    padding: {
      default: spacing.large,
      [breakpoints.small]: spacing.medium
    }
  },
  eyebrow: {
    color: colors.foregroundLink,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '0.75rem'
  },
  display: {
    color: colors.foregroundText,
    fontSize: {
      default: 'clamp(2.25rem, 5vw, 3rem)',
      [breakpoints.small]: fontSize.h1
    },
    lineHeight: 1.15,
    fontWeight: fontWeight.bold,
    letterSpacing: '-0.025em',
    maxWidth: '48rem',
    marginBottom: '1.25rem'
  },
  main: {
    maxWidth: '48rem',
    marginInline: 'auto',
    padding: {
      default: '3rem 1.5rem',
      [breakpoints.small]: '2rem 1rem'
    }
  },
  h1: {
    fontSize: fontSize.h1,
    fontWeight: fontWeight.bold,
    letterSpacing: '-0.02em',
    marginBottom: '0.5rem'
  },
  h2: {
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
    letterSpacing: '-0.01em',
    marginBottom: '0.5rem'
  },
  muted: {
    color: colors.foregroundMuted,
    fontSize: fontSize.small
  },
  link: {
    color: {
      default: colors.foregroundLink,
      ':hover': colors.foregroundLinkHover
    },
    fontWeight: fontWeight.semibold,
    textDecorationColor: colors.underlineLink,
    textDecorationThickness: '0.1em',
    textUnderlineOffset: '0.2em',
    transitionDuration: duration.fast,
    transitionProperty: 'color',
    transitionTimingFunction: 'ease'
  },
  focusable: {
    ':focus-visible': {
      outline: `3px solid ${colors.focusRing}`,
      outlineOffset: '3px',
      borderRadius: radius.small
    }
  }
})
