import { definePlugin, onRequest } from 'h3'

/**
 * Marks every request as served by the development server (`event.context.development`), which is
 * what lets an HTML response allow the few things Vite needs there. Registered only under
 * `pnpm dev`; a production request never carries the mark.
 */
export const developmentMode = definePlugin((app) => {
  app.use(
    onRequest((event) => {
      event.context.development = true
    })
  )
})
