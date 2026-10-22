import { Effect, Layer } from 'effect'
import { resolveModuleURL } from 'exsolve'
import { chmodSync, existsSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteDevServer } from 'vite-plus'
import { loadEnv } from 'vite-plus'
import { DatabaseLayer } from '#/database/adapter.ts'
import { migrateAndSeed } from '#/database/migrator.ts'
import { apiHandler, apiDocsPath } from '#/kernel/http/api.ts'
import { CoreLayer } from '#/kernel/layers.ts'

const ENTRYPOINT = 'entry.js'

const prepare = Effect.gen(function* () {
  yield* migrateAndSeed
  yield* Effect.logInfo('dev database migrated')
}).pipe(Effect.provide(DatabaseLayer.pipe(Layer.provideMerge(CoreLayer))))

const toRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const method = req.method ?? 'GET'
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else headers.append(name, value)
  }
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half'
  } as RequestInit)
}

const writeResponse = async (req: IncomingMessage, res: ServerResponse, response: Response) => {
  res.statusCode = response.status
  const cookies = response.headers.getSetCookie()
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)
  if (req.method === 'HEAD' || response.body === null) {
    res.end()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const body = response.body
    if (body === null) {
      res.end()
      resolve()
      return
    }
    Readable.fromWeb(body as NodeReadableStream).pipe(res)
    res.on('finish', () => resolve())
    res.on('error', reject)
  })
}

const entry = fileURLToPath(new URL('../main.ts', import.meta.url))

// Standalone code splitting: one chunk per top-level package. The group
// `name()` skips pnpm's virtual-store segment and derives the package name
// from the module path; exsolve verifies the package resolves so chunk names
// match real dependencies. Modules outside any package stay in the entry.
const packageNameFor = (moduleId: string): string | null => {
  const match = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(@[^/]+\/[^/]+|[^@][^/]*)/.exec(
    moduleId
  )
  const name = match?.[1]
  if (name === undefined) return null
  // Flatten scoped packages, so chunks never land in nested subdirectories.
  const flat = name.replace('/', '__')
  return resolveModuleURL(name, { try: true }) === undefined ? null : flat
}

interface EffectDevPluginOptions {
  enabled: boolean
}

export const effectVite = (opts: EffectDevPluginOptions): Plugin => {
  // Resolved in configResolved; used by closeBundle
  // to post-process the emitted entry bundle.
  let distDir = ''
  return {
    name: 'effect-server',
    configResolved(config) {
      distDir = path.resolve(config.root, 'dist')
    },
    config(_config, env) {
      if (env.command !== 'build' || !opts.enabled) return
      // `--mode standalone` inlines every dependency so dist/ deploys
      // without node_modules; `--minify` opts in to oxc minification
      // for a smaller bundle.
      const standalone = env.mode === 'standalone'
      return {
        environments: {
          client: {
            build: {
              rolldownOptions: {
                output: {
                  entryFileNames: 'assets/entry-client-[hash].js',
                  chunkFileNames: 'assets/[name]-[hash].js',
                  assetFileNames: (asset) =>
                    asset.names.some((name) => name.startsWith('virtual_solid'))
                      ? 'assets/entry-client-[hash][extname]'
                      : 'assets/[name]-[hash][extname]'
                }
              }
            }
          },
          effect: {
            consumer: 'server',
            ...(standalone
              ? {
                  resolve: {
                    conditions: ['node', 'import', 'default'],
                    noExternal: true
                  }
                }
              : {}),
            build: {
              outDir: 'dist',
              emptyOutDir: false,
              minify: process.argv.includes('--minify') ? 'oxc' : false,
              rolldownOptions: {
                input: entry,
                output: {
                  format: 'esm',
                  entryFileNames: ENTRYPOINT,
                  // Vendor chunks (standalone) and non-JS assets share the
                  // chunks directory instead of the rolldown default.
                  chunkFileNames: 'chunks/[name]-[hash].js',
                  assetFileNames: 'chunks/[name]-[hash][extname]',
                  // Standalone splits dependencies into a shared vendor chunk
                  // so no single file gets too large; the plain build stays
                  // one file because it only contains app code.
                  ...(standalone
                    ? {
                        codeSplitting: {
                          groups: [{ name: packageNameFor, debugName: 'package-chunks' }]
                        }
                      }
                    : { codeSplitting: false }),
                  banner: (chunk: { isEntry: boolean }) => {
                    const envBinaryPath = process.env.ENV_BINARY_PATH ?? '/usr/bin/env'
                    return chunk.isEntry ? `#!${envBinaryPath} node` : ''
                  }
                }
              }
            }
          }
        }
      }
    },
    // Stale-artifact clean before the effect environment emits. emptyOutDir
    // stays false because this environment writes to dist/ itself, which
    // would wipe the earlier client/server environment output. Everything
    // under dist/chunks (plus entry.js) belongs to this environment only.
    buildStart() {
      rmSync(path.join(distDir, 'assets'), { recursive: true, force: true })
      rmSync(path.join(distDir, 'chunks'), { recursive: true, force: true })
      rmSync(path.join(distDir, ENTRYPOINT), { force: true })
    },
    closeBundle() {
      const entryFile = path.join(distDir, ENTRYPOINT)
      if (existsSync(entryFile)) chmodSync(entryFile, 0o755)
      // Dedupe stylex <outDir>/assets/stylex.css for bundles. Its styles already
      // ship inside the client's entry stylesheet, so drop the duplicate.
      const stylexFile = path.join(distDir, 'assets', 'stylex.css')
      if (existsSync(stylexFile)) {
        rmSync(stylexFile)
        rmSync(path.join(distDir, 'assets'), { recursive: true, force: true })
      }
    },
    configureServer(server: ViteDevServer) {
      if (!opts.enabled) return

      // Mirror the start command's --env-file-if-exists=.env.local so the dev
      // server reads the same configuration; real environment entries win.
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value
      }

      const ready = Effect.runPromise(prepare).then(() => apiHandler())
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? ''
        const handled = pathname.startsWith('/api/') || pathname === apiDocsPath
        if (!handled) {
          next()
          return
        }
        void ready
          .then((handler: Awaited<ReturnType<typeof apiHandler>>) =>
            handler.handler(toRequest(req), undefined as never)
          )
          .then((response) => writeResponse(req, res, response))
          .catch(next)
      })
      return async () => {
        await ready.then(
          (handler) => handler.dispose(),
          () => undefined
        )
      }
    }
  }
}
