import { expect, it } from 'vite-plus/test'
import { api } from '#/kernel/http/api.ts'
import { apiRouteTemplates, pageRoute, routeLabel, unmatchedRoute } from './route-labels.ts'

it('derives the wire templates from the HttpApi contract', () => {
  expect(apiRouteTemplates(api)).toEqual(['/api/health', '/api/users', '/api/users/:id'])
})

it('bounds the label set to contract templates and the fixed literals', () => {
  expect(routeLabel(undefined)).toBe(unmatchedRoute)
  expect(routeLabel('*')).toBe(pageRoute)
  expect(routeLabel('/*')).toBe(pageRoute)
  expect(routeLabel('/api/health')).toBe('/api/health')
  expect(routeLabel('/api/users/:id')).toBe('/api/users/:id')
})
