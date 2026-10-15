import { style } from '@vanilla-extract/css'
import { vars } from './theme.css.ts'

export const body = style({
  background: vars.color.surface,
  color: vars.color.text,
  fontFamily: vars.font.body,
  lineHeight: 1.5
})

export const header = style({
  borderBottom: `1px solid ${vars.color.border}`,
  padding: `${vars.space.md} ${vars.space.lg}`,
  fontWeight: 600
})

export const main = style({
  margin: '0 auto',
  maxWidth: '48rem',
  padding: vars.space.lg
})
