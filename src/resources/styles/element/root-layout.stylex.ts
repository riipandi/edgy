// Root layout (app shell) styles.
import * as stylex from '@stylexjs/stylex'
import { colors } from '../core/colors.stylex'
import { duration } from '../core/tokens.stylex'

export const styles = stylex.create({
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    color: colors.foregroundText,
    backgroundColor: colors.backgroundPage,
    transition: `background-color ${duration.medium} ease, color ${duration.medium} ease`
  },
  section: {
    width: '100%',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  }
})
