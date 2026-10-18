// Not-found page styles.
import * as stylex from '@stylexjs/stylex'
import { fontSize, fontWeight } from '../core/tokens.stylex'

export const styles = stylex.create({
  code: {
    display: 'block',
    fontSize: 'clamp(3rem, 10vw, 5rem)',
    fontWeight: fontWeight.bold,
    lineHeight: 1.1,
    letterSpacing: '-0.03em'
  },
  message: {
    fontSize: fontSize.body,
    marginTop: '0.5rem'
  }
})
