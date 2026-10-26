import * as HttpApi from 'effect/http-api/HttpApi'
import type { api } from '#/kernel/http/api.ts'

export const pageRoute = 'page'
export const unmatchedRoute = 'unmatched'

// The route table derived from the contract itself: `.prefix('/api')` bakes the
// prefix into every endpoint path, so these are the wire templates. A new
// endpoint extends the label set automatically.
export const apiRouteTemplates = (httpApi: typeof api): string[] => {
  const templates: string[] = []
  HttpApi.reflect(httpApi, {
    onGroup: () => {},
    onEndpoint: ({ endpoint }) => {
      if (!templates.includes(endpoint.path)) templates.push(endpoint.path)
    }
  })
  return templates
}

// The SSR catch-all registers as `*` and serves every page path under one
// label. The API fallback answers unmatched /api paths under one wildcard —
// it is not a real resource, so it shares the `unmatched` label with requests
// the router never matched at all.
export const routeLabel = (routePath: string | undefined): string => {
  if (routePath === undefined) return unmatchedRoute
  if (routePath === '/api/*') return unmatchedRoute
  return routePath === '*' || routePath === '/*' ? pageRoute : routePath
}
