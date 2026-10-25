import { Cause, Effect, Layer, Logger } from 'effect'
import * as OpenApi from 'effect/http-api/OpenApi'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vite-plus/test'
import { AppConfig } from '#/kernel/config/config.ts'
import { api } from '#/kernel/http/api.ts'
import { server } from '#/kernel/http/serve.ts'
import pkg from '../../package.json' with { type: 'json' }
import { config } from '../fixtures/config.ts'
import { migratedDatabaseFor } from '../fixtures/database.ts'
import { testServices } from '../fixtures/users.ts'

describe('the api declaration', () => {
  it('generates the openapi document under the /api prefix', () => {
    const doc = OpenApi.fromApi(api)
    expect(doc.info.title).toBe(pkg.name)
    expect(doc.info.version).toBe(pkg.version)
    const paths = Object.keys(doc.paths)
    expect(paths).toContain('/api/health')
    expect(paths).toContain('/api/users')
    expect(paths).toContain('/api/users/{id}')
  })
})

// The serve layer listens eagerly when built, so the test reserves a port up
// front and points the fixture config at it; port 0 would hide the address.
const reservePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close((error) => (error ? reject(error) : resolve(port)))
    })
  })

// The serve layer listens eagerly when built and spawns its own listening and
// request fibers; only a logger ambient around that build reaches them, so the
// silent logger rides the outermost provide.
const silentLogger = Logger.layer([Logger.make(() => void 0)])

describe('the serve composition root', () => {
  it('boots, answers /api/health, and disposes cleanly', async () => {
    const port = await reservePort()
    const bootConfig = Layer.succeed(AppConfig, {
      ...config,
      server: { ...config.server, host: '127.0.0.1', port }
    })
    const serveLayer = server.pipe(
      Layer.provide(bootConfig),
      Layer.provide(testServices),
      Layer.provide(migratedDatabaseFor('serve-test.db'))
    )

    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise(() =>
          fetch(`http://127.0.0.1:${port}/api/health`)
        )
        expect(response.status).toBe(200)
        expect(response.headers.get('x-request-id')).toBeTruthy()
        const body = yield* Effect.tryPromise(() => response.json())
        expect(body.status).toBe('ok')
        expect(body.details.database.status).toBe('up')
      })
        .pipe(Effect.provide(serveLayer), Effect.scoped)
        .pipe(Effect.provide(silentLogger))
    )

    if (exit._tag === 'Failure') {
      console.log('BOOT CAUSE:', Cause.pretty(exit.cause).slice(0, 600))
    }
    expect(exit._tag).toBe('Success')
  })
})
