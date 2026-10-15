import { style } from '@vanilla-extract/css'
import { vars } from './theme.css.ts'

export const body = style({
  background: vars.color.surface,
  color: vars.color.text,
  fontFamily: vars.font.body,
  lineHeight: 1.5
})

export const header = style({
  display: 'flex',
  alignItems: 'baseline',
  gap: vars.space.lg,
  borderBottom: `1px solid ${vars.color.border}`,
  padding: `${vars.space.md} ${vars.space.lg}`
})

export const brand = style({ fontWeight: 600, color: 'inherit', textDecoration: 'none' })

export const nav = style({ display: 'flex', gap: vars.space.md })

export const link = style({
  color: vars.color.accent,
  textDecoration: 'none',
  ':hover': { textDecoration: 'underline' }
})

export const main = style({
  margin: '0 auto',
  maxWidth: '48rem',
  padding: vars.space.lg
})
