// StyleX emits `className`, which is what React spreads; use as
// {...sx(styles.a, cond && styles.b)}.
import * as stylex from '@stylexjs/stylex'

// stylex.props itself accepts themes, pseudo-class fragments, and conditionals;
// the wrapper only normalizes the output shape, so the inputs pass through untyped.
export const sx = (...styles: unknown[]) =>
  stylex.props(...(styles as never[])) as {
    className?: string
    style?: Readonly<Record<string, string | number>>
  }
