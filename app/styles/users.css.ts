import { style } from '@vanilla-extract/css'
import { vars } from './theme.css.ts'

export const filter = style({
  width: '100%',
  padding: vars.space.sm,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  font: 'inherit',
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' }
})

export const muted = style({ color: vars.color.muted, fontSize: '0.875rem' })

export const list = style({ listStyle: 'none', margin: 0, padding: 0 })

export const row = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: `${vars.space.sm} 0`,
  borderBottom: `1px solid ${vars.color.border}`
})

export const pager = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: vars.space.sm,
  paddingTop: vars.space.sm,
  color: vars.color.muted,
  fontSize: '0.875rem'
})

export const pagerLink = style({
  color: vars.color.accent,
  ':focus-visible': { outline: `2px solid ${vars.color.accent}`, outlineOffset: '2px' }
})
