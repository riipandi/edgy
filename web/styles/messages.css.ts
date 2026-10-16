import { style } from '@vanilla-extract/css'
import { vars } from './theme.css.ts'

export const status = style({
  margin: 0,
  fontSize: '4rem',
  lineHeight: 1,
  fontWeight: 700,
  color: vars.color.accent
})

export const lead = style({ fontSize: '1.25rem', margin: `${vars.space.sm} 0` })

export const detail = style({ color: vars.color.muted, margin: `${vars.space.xs} 0` })

export const code = style({ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' })
