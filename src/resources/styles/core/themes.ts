import * as stylex from '@stylexjs/stylex'
import { colors } from './colors.stylex.ts'

/**
 * Dark theme — a single `stylex.createTheme` per variable group. Values are
 * static by design: StyleX resolves `createTheme` at compile time. Apply the
 * class on a container (or the root element) with sx(theme); descendants
 * pick up the overridden values.
 */
const darkColors = stylex.createTheme(colors, {
  // Surfaces
  backgroundPage: '#0b0f17',
  backgroundNav: '#070a10',
  backgroundCard: '#141a24',

  // Text
  foregroundText: '#e2e8f0',
  foregroundMuted: '#94a3b8',

  // Nav
  foregroundNavLink: '#93c5fd',
  foregroundNavLinkHover: '#dbeafe',
  foregroundNavLinkActive: '#ffffff',
  backgroundNavLinkHover: 'rgb(255 255 255 / 8%)',
  backgroundNavLinkActive: 'rgb(255 255 255 / 14%)',

  // Links
  foregroundLink: '#7bb6df',
  foregroundLinkHover: '#a5d0ea',
  underlineLink: '#4f7fa6',

  // Borders and focus
  borderSubtle: '#243044',
  focusRing: '#38bdf8',

  // Accents
  accentCode: '#f472b6',
  backgroundCode: '#1c2532'
})

export { darkColors }
