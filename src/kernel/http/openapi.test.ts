import { describe, expect, it } from '@effect/vitest'
import { readFileSync } from 'node:fs'
import pkg from '../../../package.json' with { type: 'json' }
import { buildOpenApi } from './openapi.ts'
import { renderOpenApi } from './openapi_document.ts'
import { defineRouteGroup, routesOf } from './router.ts'

const document = JSON.parse(renderOpenApi('1.2.3'))

/** Every `$ref` of `value`, which must name something under `components.schemas`. */
const refsIn = (value: unknown): string[] =>
  typeof value !== 'object' || value === null
    ? []
    : Object.entries(value).flatMap(([key, child]) =>
        key === '$ref' && typeof child === 'string' ? [child] : refsIn(child)
      )

describe('the API description', () => {
  it('is OpenAPI 3.1 with the title and the version it was given', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.info).toMatchObject({ title: 'edgy API', version: '1.2.3' })
  })

  it('describes every /api route, and nothing outside /api', () => {
    const operations = Object.entries(document.paths).flatMap(([path, methods]) =>
      Object.keys(methods as object).map((method) => `${method.toUpperCase()} ${path}`)
    )
    expect(operations.sort()).toEqual(['GET /api/users', 'GET /api/users/{id}', 'POST /api/users'])
  })

  it('reads the query of a list from its schema', () => {
    const list = document.paths['/api/users'].get
    expect(list.operationId).toBe('getApiUsers')
    expect(list.parameters.map((p: { name: string }) => p.name)).toEqual([
      'limit',
      'cursor',
      'sort_by',
      'sort_order'
    ])
    const byName = Object.fromEntries(list.parameters.map((p: any) => [p.name, p]))
    expect(byName.sort_by.schema.enum).toEqual(['id', 'email', 'name'])
    expect(byName.limit.description).toMatch(/1 to 100/)
    expect(list.parameters.every((p: any) => p.in === 'query' && p.required === false)).toBe(true)
  })

  it('reads the path of one resource, and the body of a create', () => {
    const one = document.paths['/api/users/{id}'].get
    expect(one.parameters).toMatchObject([{ name: 'id', in: 'path', required: true }])

    const create = document.paths['/api/users'].post
    const body = create.requestBody.content['application/json'].schema
    expect(create.requestBody.required).toBe(true)
    expect(body.required).toEqual(['email', 'name'])
    expect(body.properties.email.maxLength).toBe(254)
    expect(Object.keys(create.responses)).toEqual(['201', 'default'])
  })

  it('wraps the answer in the envelope, and a list in its page metadata', () => {
    const list =
      document.paths['/api/users'].get.responses['200'].content['application/json'].schema
    expect(list.properties.data.type).toBe('array')
    expect(list.properties.data.items.required).toEqual(['id', 'email', 'name'])
    expect(list.properties.metadata.$ref).toBe('#/components/schemas/ApiPageMetadata')
    expect(list.properties.links.$ref).toBe('#/components/schemas/ApiLinks')

    const one = document.paths['/api/users/{id}'].get.responses['200'].content['application/json']
    expect(one.schema.properties.metadata.$ref).toBe('#/components/schemas/ApiMetadata')
    expect(one.schema.properties).not.toHaveProperty('links')
  })

  it('answers every operation with the error envelope as its default', () => {
    for (const methods of Object.values(document.paths)) {
      for (const operation of Object.values(methods as Record<string, any>)) {
        expect(operation.responses.default.content['application/json'].schema.$ref).toBe(
          '#/components/schemas/ApiError'
        )
      }
    }
  })

  it('has no dangling reference', () => {
    const known = Object.keys(document.components.schemas).map((n) => `#/components/schemas/${n}`)
    const refs = refsIn(document)
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(known).toContain(ref)
  })

  it('is the file that is committed (run `pnpm app openapi:generate` after a change)', () => {
    const committed = readFileSync(new URL('../../../docs/openapi.json', import.meta.url), 'utf8')
    expect(committed).toBe(renderOpenApi(pkg.version))
  })
})

describe('route groups read without an app', () => {
  const handler = async () => 'x'

  it('joins prefixes through nested groups and keeps the methods', () => {
    const inner = defineRouteGroup({
      prefix: '/things',
      routes: (r) => {
        r.get('/', handler)
        r.get('/:id', handler)
        r.delete('/:id', handler)
      }
    })
    const outer = defineRouteGroup({
      prefix: '/v1',
      routes: (r) => r.register(inner)
    })
    expect(routesOf(outer, '/api').map((r) => `${r.method} ${r.path}`)).toEqual([
      'get /api/v1/things',
      'get /api/v1/things/:id',
      'delete /api/v1/things/:id'
    ])
  })

  it('reads nothing from a plain plugin', () => {
    expect(routesOf(() => {})).toEqual([])
  })
})

describe('a handler that declared nothing', () => {
  it('is an error, not a silent gap', () => {
    const group = defineRouteGroup({
      prefix: '/x',
      routes: (r) => r.get('/', async () => 'x')
    })
    expect(() => buildOpenApi({ title: 't', version: '1', routes: routesOf(group) })).toThrow(
      /declares no description/
    )
  })
})
