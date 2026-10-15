import { Schema } from 'effect'
import { docOf, type HandlerDoc } from './handler_doc.ts'
import type { DeclaredRoute } from './router.ts'

type Json = Record<string, unknown>

/** What the document needs to be built. */
export interface OpenApiInput {
  readonly title: string
  readonly version: string
  readonly description?: string
  readonly routes: readonly DeclaredRoute[]
}

/** The envelope parts every response shares, written once and referenced. */
const COMPONENTS: Json = {
  ApiLinks: {
    type: 'object',
    description: 'Relative links by relation; `null` where there is none.',
    additionalProperties: { type: ['string', 'null'] }
  },
  ApiMetadata: {
    type: 'object',
    required: ['status_code', 'request_id'],
    properties: {
      status_code: { type: 'integer' },
      request_id: {
        type: 'string',
        description: 'The `req_` id, also in the `x-request-id` header.'
      },
      trace_id: { type: 'string', description: 'Set when the request was traced.' },
      cache: { enum: ['hit', 'miss', 'bypass'], description: 'Set when a cached read answered.' },
      rate_limit: {
        type: 'object',
        required: ['limit', 'reset'],
        properties: {
          limit: { type: 'integer' },
          remaining: { type: 'integer' },
          reset: { type: 'integer', description: 'Unix time at which the window resets.' }
        }
      }
    }
  },
  ApiPageMetadata: {
    description: 'Metadata of a collection: the position in it.',
    allOf: [
      { $ref: '#/components/schemas/ApiMetadata' },
      {
        type: 'object',
        required: ['limit', 'has_more', 'next_cursor'],
        properties: {
          limit: { type: 'integer' },
          has_more: { type: 'boolean' },
          next_cursor: {
            type: ['string', 'null'],
            description: 'Opaque. Pass it as `cursor` for the next page; `null` on the last.'
          }
        }
      }
    ]
  },
  ApiError: {
    type: 'object',
    required: ['status', 'message', 'error', 'metadata'],
    properties: {
      status: { const: 'error' },
      message: { type: 'string' },
      error: {
        type: 'object',
        required: ['code', 'retryable'],
        properties: {
          code: { type: 'string', description: 'Stable; clients switch on it (`NOT_FOUND`).' },
          retryable: { type: 'boolean' },
          details: { description: 'Per-error facts, such as the validation issues.' }
        }
      },
      metadata: { $ref: '#/components/schemas/ApiMetadata' }
    }
  }
}

/** The JSON Schema of `schema` and the named schemas it refers to. */
const jsonSchemaOf = (schema: Schema.Top): { schema: Json; definitions: Json } => {
  const document = Schema.toJsonSchemaDocument(schema)
  // Open objects are the default in OpenAPI, so `additionalProperties: true` only adds noise.
  const clean = (key: string, value: unknown) =>
    key === 'additionalProperties' && value === true ? undefined : value
  const rewrite = (value: unknown): Json => {
    const parsed: unknown = JSON.parse(
      JSON.stringify(value, clean).replaceAll('#/$defs/', '#/components/schemas/')
    )
    return isJson(parsed) ? parsed : {}
  }
  return { schema: rewrite(document.schema), definitions: rewrite(document.definitions) }
}

const isJson = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const objectsIn = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isJson) : [])

/**
 * A parameter's schema, tidied. `{ anyOf: [X, null] }` is how an optional key reads, but a
 * parameter is simply optional; and a key annotation arrives as `allOf: [{ description }]`,
 * which reads better merged in.
 */
const tidy = (schema: unknown): Json => {
  if (!isJson(schema)) return {}
  const { anyOf, allOf, ...rest } = schema
  let result: Json = rest
  for (const part of objectsIn(allOf)) result = { ...part, ...result }
  if (Array.isArray(anyOf)) {
    const kept = objectsIn(anyOf).filter((part) => JSON.stringify(part) !== '{"type":"null"}')
    const [only] = kept
    return kept.length === 1 && only !== undefined
      ? { ...result, ...only }
      : { ...result, anyOf: kept }
  }
  return result
}

/** An object schema's properties as parameters of kind `where`. */
const parametersOf = (schema: Schema.Top, where: 'path' | 'query', definitions: Json): Json[] => {
  const { schema: object, definitions: found } = jsonSchemaOf(schema)
  Object.assign(definitions, found)
  const properties = isJson(object['properties']) ? object['properties'] : {}
  const required = new Set(
    Array.isArray(object['required']) ? object['required'].filter((n) => typeof n === 'string') : []
  )
  return Object.entries(properties).map(([name, property]) => {
    const { description, ...rest } = tidy(property)
    return {
      name,
      in: where,
      required: where === 'path' || required.has(name),
      ...(typeof description === 'string' ? { description } : {}),
      schema: rest
    }
  })
}

const SUCCESS_TEXT: Readonly<Record<number, string>> = { 200: 'Success', 201: 'Created' }

const successSchema = (doc: HandlerDoc, data: Json | undefined): Json => {
  const page = doc.kind === 'page'
  return {
    type: 'object',
    required: ['status', ...(data === undefined ? [] : ['data']), 'metadata'],
    properties: {
      status: { const: 'success' },
      ...(doc.kind === 'message' ? { message: { type: 'string' } } : {}),
      ...(data === undefined ? {} : { data: page ? { type: 'array', items: data } : data }),
      metadata: { $ref: `#/components/schemas/${page ? 'ApiPageMetadata' : 'ApiMetadata'}` },
      ...(page ? { links: { $ref: '#/components/schemas/ApiLinks' } } : {})
    }
  }
}

const operationId = (method: string, path: string): string =>
  method +
  path
    .split('/')
    .filter((part) => part !== '')
    .map((part) => part.replace(/[{}]/g, ''))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')

/**
 * The OpenAPI 3.1 description of `routes`, derived from what each handler declared: the schemas
 * that validate its inputs and encode its answer, wrapped in the response envelope. A route whose
 * handler did not go through the kit has nothing to derive from, and is an error rather than a
 * silent gap.
 */
export const buildOpenApi = (input: OpenApiInput): Json => {
  const definitions: Json = {}
  const paths: Record<string, Record<string, Json>> = {}

  for (const route of input.routes) {
    const doc = docOf(route.handler)
    if (doc === undefined) {
      throw new Error(
        `${route.method.toUpperCase()} ${route.path} declares no description: build the handler with defineHandler, definePagedHandler or defineMessageHandler`
      )
    }

    const path = route.path.replace(/:(\w+)/g, '{$1}')
    const parameters = [
      ...(doc.params === undefined ? [] : parametersOf(doc.params, 'path', definitions)),
      ...(doc.query === undefined ? [] : parametersOf(doc.query, 'query', definitions))
    ]
    let data: Json | undefined
    if (doc.response !== undefined) {
      const { schema, definitions: found } = jsonSchemaOf(doc.response)
      Object.assign(definitions, found)
      data = schema
    }
    let requestBody: Json | undefined
    if (doc.body !== undefined) {
      const { schema, definitions: found } = jsonSchemaOf(doc.body)
      Object.assign(definitions, found)
      requestBody = { required: true, content: { 'application/json': { schema } } }
    }

    const tag = route.path.split('/').filter((part) => part !== '')[1]
    ;(paths[path] ??= {})[route.method] = {
      operationId: operationId(route.method, path),
      ...(doc.summary === undefined ? {} : { summary: doc.summary }),
      ...(tag === undefined ? {} : { tags: [tag] }),
      ...(parameters.length === 0 ? {} : { parameters }),
      ...(requestBody === undefined ? {} : { requestBody }),
      responses: {
        [String(doc.status)]: {
          description: SUCCESS_TEXT[doc.status] ?? 'Success',
          content: { 'application/json': { schema: successSchema(doc, data) } }
        },
        default: {
          description: 'An error, in the error envelope.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ApiError' } }
          }
        }
      }
    }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: input.title,
      version: input.version,
      ...(input.description === undefined ? {} : { description: input.description })
    },
    paths,
    components: { schemas: { ...COMPONENTS, ...definitions } }
  }
}
