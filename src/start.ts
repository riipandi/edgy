import { createMiddleware, createStart } from '@tanstack/react-start'
import { runWithPageMeta, type PageMeta } from '#/kernel/page_meta.ts'

// The server-function handlers record their page-read metadata in the
// request store; this middleware copies it onto the HTML response before
// it is sent, wrapped so the whole render shares one store. The pipeline
// hands back either a bare Response or a wrapper carrying one — keep the
// shape it gave us.
const pageResponseMeta = createMiddleware().server(async ({ next }) => {
  const state: PageMeta = {}
  const result = await runWithPageMeta(state, next)
  if (state.cache === undefined) return result

  const carried = result as typeof result & { response?: unknown }
  const inner = carried.response instanceof Response ? carried.response : (result as unknown)
  if (!(inner instanceof Response)) return result

  const headers = new Headers(inner.headers)
  headers.set('x-cache', state.cache)
  const updated = new Response(inner.body, {
    status: inner.status,
    statusText: inner.statusText,
    headers
  })
  if (result instanceof Response) return updated
  return { ...carried, response: updated }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [pageResponseMeta]
}))
