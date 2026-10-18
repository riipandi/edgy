// Solid adapter for stylex.props: Solid expects `class`, StyleX emits
// `className`. Use as {...sx(styles.a, cond && styles.b)}.
import * as stylex from '@stylexjs/stylex'

type Mapped = { class?: string; style?: Record<string, string | number> }

// stylex.props itself accepts themes, pseudo-class fragments, and conditionals;
// the wrapper only maps the output keys, so the inputs pass through untyped.
export const sx = (...styles: unknown[]): Mapped => {
  const props = stylex.props(...(styles as never[])) as { className?: string; style?: never }
  const mapped: Mapped = {}
  if (props.className !== undefined) mapped.class = props.className
  if (props.style !== undefined) mapped.style = props.style as never
  return mapped
}
