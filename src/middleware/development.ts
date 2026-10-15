import { definePlugin, onRequest } from 'h3'

/**
 * Marks each request as served by the development server (`event.context.development`),
 * which lets an HTML response allow what Vite needs. Registered only under `pnpm dev`;
 * production requests never carry the mark.
 */
export const developmentMode = definePlugin((app) => {
  app.use(
    onRequest((event) => {
      event.context.development = true
    })
  )
})
