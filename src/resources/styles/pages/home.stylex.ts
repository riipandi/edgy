// Home page styles — hero + feature cards layout (adapted from tanstart).
import * as stylex from '@stylexjs/stylex'
import { colors } from '#/resources/styles/core/colors.stylex.ts'
import {
  breakpoints,
  duration,
  fontSize,
  fontWeight,
  radius
} from '#/resources/styles/core/tokens.stylex.ts'

// StyleX keyframes must be declared in the same module that uses them.
const fadeSlideIn = stylex.keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(12px)'
  },
  to: {
    opacity: 1,
    transform: 'translateY(0)'
  }
})

export const styles = stylex.create({
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: radius.large,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundCard,
    paddingBlock: '2.5rem',
    paddingInline: {
      default: '2.5rem',
      [breakpoints.small]: '1.5rem'
    },
    animationName: fadeSlideIn,
    animationDuration: '500ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'backwards'
  },
  glow: {
    pointerEvents: 'none',
    position: 'absolute',
    width: '14rem',
    height: '14rem',
    borderRadius: radius.full,
    filter: 'blur(64px)'
  },
  glowPrimary: {
    top: '-6rem',
    left: '-5rem',
    backgroundColor: 'rgb(29 95 145 / 20%)'
  },
  glowPrimaryFaded: {
    bottom: '-5rem',
    right: '-5rem',
    backgroundColor: 'rgb(29 95 145 / 10%)'
  },
  description: {
    color: colors.foregroundMuted,
    fontSize: {
      default: '1.125rem',
      [breakpoints.small]: fontSize.body
    },
    maxWidth: '42rem',
    marginBottom: '2rem'
  },
  ctaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem'
  },
  cardGrid: {
    marginTop: '2rem',
    display: 'grid',
    gap: '1rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      [breakpoints.small]: '1fr'
    }
  },
  card: {
    borderRadius: radius.large,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundCard,
    padding: '1.25rem',
    animationName: fadeSlideIn,
    animationDuration: '500ms',
    animationTimingFunction: 'ease-out',
    animationFillMode: 'backwards',
    transitionProperty: 'transform, box-shadow',
    transitionDuration: duration.medium,
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-2px)'
    },
    boxShadow: {
      default: 'none',
      ':hover': '0 4px 12px rgb(15 23 42 / 8%)'
    }
  },
  cardTitle: {
    color: colors.foregroundText,
    fontSize: fontSize.body,
    fontWeight: fontWeight.semibold,
    marginBottom: '0.5rem'
  },
  cardDescription: {
    color: colors.foregroundMuted,
    fontSize: fontSize.small,
    margin: 0
  },
  quickStart: {
    marginTop: '2rem',
    borderRadius: radius.large,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundCard,
    padding: '1.5rem',
    animationName: fadeSlideIn,
    animationDuration: '500ms',
    animationTimingFunction: 'ease-out',
    animationDelay: '500ms',
    animationFillMode: 'backwards'
  },
  quickStartTitle: {
    color: colors.foregroundLink,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    marginBottom: '0.5rem'
  },
  quickStartList: {
    color: colors.foregroundMuted,
    fontSize: fontSize.small,
    lineHeight: 1.6,
    margin: 0,
    paddingInlineStart: '1.25rem',
    listStyleType: 'disc',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  code: {
    color: colors.accentCode,
    backgroundColor: colors.backgroundCode,
    borderRadius: radius.small,
    padding: '0.05em 0.35em',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: '0.9em'
  },
  buttonPrimary: {
    display: 'inline-block',
    borderRadius: radius.full,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: colors.foregroundLink,
    backgroundColor: {
      default: 'rgb(29 95 145 / 8%)',
      ':hover': 'rgb(29 95 145 / 16%)'
    },
    color: colors.foregroundLink,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    paddingBlock: '0.625rem',
    paddingInline: '1.25rem',
    textDecoration: 'none',
    transitionProperty: 'transform, background-color',
    transitionDuration: duration.fast,
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-2px)'
    }
  },
  buttonNeutral: {
    display: 'inline-block',
    borderRadius: radius.full,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: {
      default: colors.borderSubtle,
      ':hover': colors.foregroundMuted
    },
    backgroundColor: 'rgb(148 163 184 / 10%)',
    color: colors.foregroundText,
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    paddingBlock: '0.625rem',
    paddingInline: '1.25rem',
    textDecoration: 'none',
    transitionProperty: 'transform, border-color',
    transitionDuration: duration.fast,
    transform: {
      default: 'translateY(0)',
      ':hover': 'translateY(-2px)'
    }
  }
})
