import { link } from '../styles/components/link.css.ts'
import { code, detail, lead, status } from '../styles/elements/messages.css.ts'
import { AppShell } from './app-shell.tsx'

/** What the error page is told: enough for a person to describe the problem. */
export interface ErrorPageInput {
  readonly status: number
  readonly message: string
  readonly requestId?: string
  readonly retryAfter?: number
}

/**
 * The error page: it renders for any status and must never be the thing that breaks, so it stays
 * out of the app shell's hydration and renders statically.
 */
export const ErrorPage = (input: ErrorPageInput) => (
  <AppShell title={`${input.status} ${input.message}`}>
    <p class={status}>{input.status}</p>
    <p class={lead}>{input.message}</p>
    {input.retryAfter !== undefined && (
      <p class={detail}>Try again in {input.retryAfter} seconds.</p>
    )}
    {input.requestId !== undefined && (
      <p class={detail}>
        Reference: <span class={code}>{input.requestId}</span>
      </p>
    )}
    <p>
      <a href='/' class={link}>
        Back to the start
      </a>
    </p>
  </AppShell>
)

export default ErrorPage
