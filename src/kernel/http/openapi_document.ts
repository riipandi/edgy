import { apiModules } from '../../routes/route.ts'
import { buildOpenApi } from './openapi.ts'
import { API_PREFIX, routesOf } from './router.ts'
import { defineRouteGroup } from './router.ts'

/** The API's document as the text a file holds: stable key order, a trailing newline. */
export const renderOpenApi = (version: string): string => {
  const api = defineRouteGroup({
    prefix: API_PREFIX,
    routes: (group) => {
      for (const module of apiModules) group.register(module)
    }
  })
  const document = buildOpenApi({
    title: 'edgy API',
    version,
    description:
      'Every response is an envelope: `{ status, data | error, metadata, links? }`. Lists are paged by cursor. The API is unauthenticated and rate limited per client.',
    routes: routesOf(api)
  })
  return `${JSON.stringify(document, null, 2)}\n`
}
