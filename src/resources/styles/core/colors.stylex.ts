/**
 * Color tokens — values are the light theme. `themes.ts` overrides them for
 * dark mode with a single `stylex.createTheme`; components never branch on
 * the color scheme.
 */
import * as stylex from '@stylexjs/stylex'

export const colors = stylex.defineVars({
  // Surfaces
  backgroundPage: '#f8fafc',
  backgroundNav: '#0f172a',
  backgroundCard: '#ffffff',

  // Text
  foregroundText: '#0f172a',
  foregroundMuted: '#64748b',

  // Nav
  foregroundNavLink: '#93c5fd',
  foregroundNavLinkHover: '#dbeafe',
  foregroundNavLinkActive: '#ffffff',
  backgroundNavLinkHover: 'rgb(255 255 255 / 10%)',
  backgroundNavLinkActive: 'rgb(255 255 255 / 16%)',

  // Links
  foregroundLink: '#1d5f91',
  foregroundLinkHover: '#123f63',
  underlineLink: '#7bb6df',

  // Borders and focus
  borderSubtle: '#e2e8f0',
  focusRing: '#0284c7',

  // Accents
  accentCode: '#be185d',
  backgroundCode: '#f1f5f9'
})
