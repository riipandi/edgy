// Root layout (app shell) styles.
import * as stylex from '@stylexjs/stylex'
import { colors } from '#/resources/styles/core/colors.stylex.ts'
import { duration } from '#/resources/styles/core/tokens.stylex.ts'

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
