import { Effect, Layer } from 'effect'
import { chmodSync, existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ViteBuilder, ViteDevServer } from 'vite-plus'
import { loadEnv } from 'vite-plus'
import { DatabaseLayer } from '#/database/adapter.ts'
import { migrateAndSeed } from '#/database/migrator.ts'
import { apiHandler, apiDocsPath, metricsPath } from '#/kernel/http/api.ts'
import { CoreLayer } from '#/kernel/layers.ts'
import { copyNativeBinding } from './binding.ts'
import { assertNoExternalImports, packageNameFor, writeOxfile } from './helpers.ts'
import { toRequest, writeResponse } from './helpers.ts'

const ENTRYPOINT = 'entry.js'

const prepare = Effect.gen(function* () {
  yield* migrateAndSeed
  yield* Effect.logInfo('Dev database migrated')
}).pipe(Effect.provide(DatabaseLayer.pipe(Layer.provideMerge(CoreLayer))))

const entry = fileURLToPath(new URL('../main.ts', import.meta.url))
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')
)

interface EffectDevPluginOptions {
  enabled: boolean
}

export const effectVite = (opts: EffectDevPluginOptions): Plugin[] => {
  // Resolved in configResolved; used by the finish plugin
  // to post-process the emitted bundles.
  let distDir = ''
  let standaloneMode = false
  return [
    {
      name: 'effect-server',
      configResolved(config) {
        distDir = path.resolve(config.root, 'dist')
      },
      config(_config, env) {
        if (env.command !== 'build' || !opts.enabled) return
        // `--mode standalone` inlines every dependency so dist/ deploys
        // without a resolved node_modules tree — the SQLite engine's native
        // binding is the one file that must still ship beside the entry.
        // `--minify` opts in to oxc minification for a smaller bundle.
        const standalone = env.mode === 'standalone'
        standaloneMode = standalone
        // The SSR bundle lives in the built-in `ssr` environment (the Start
        // plugin owns its build options); standalone must inline its externals
        // the same way `effect` does, or the distroless container cannot
        // resolve them. The Turso engine is a native addon and cannot be
        // inlined, so rolldown keeps it external and the image ships it beside
        // entry.js.
        const standaloneResolve = standalone
          ? {
              resolve: {
                conditions: ['node', 'import', 'default'],
                noExternal: true
              } as { conditions: string[]; noExternal: true }
            }
          : {}
        return {
          environments: {
            client: {
              build: {
                rolldownOptions: {
                  output: {
                    entryFileNames: 'assets/entry-client-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js'
                  }
                }
              }
            },
            effect: {
              consumer: 'server',
              ...standaloneResolve,
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
            },
            ssr: standaloneResolve
          }
        }
      },
      // Stale-artifact clean before the effect environment emits. emptyOutDir
      // stays false because this environment writes to dist/ itself, which
      // would wipe the earlier client/server environment output. Everything
      // under dist/chunks (plus entry.js) belongs to this environment only,
      // and dist/server is rebuilt by the ssr environment later in the run —
      // both must go so a standalone build never asserts over a normal
      // build's leftovers. The hook fires in every environment Start builds
      // too, so guard it.
      buildStart() {
        if (this.environment?.name !== 'effect') return
        rmSync(path.join(distDir, 'assets'), { recursive: true, force: true })
        rmSync(path.join(distDir, 'server'), { recursive: true, force: true })
        rmSync(path.join(distDir, 'chunks'), { recursive: true, force: true })
        rmSync(path.join(distDir, 'node_modules'), { recursive: true, force: true })
        rmSync(path.join(distDir, ENTRYPOINT), { force: true })
      },
      // Start's buildApp builds only its client and ssr environments; build the
      // Effect app bundle here so the whole tree still lands in dist.
      async buildApp(builder: ViteBuilder) {
        if (!opts.enabled) return
        const effect = builder.environments.effect
        if (effect && !effect.isBuilt) await builder.build(effect)
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
          // `/metrics` rides along so the dev server's page fallback never
          // swallows the scrape endpoint.
          const handled =
            pathname.startsWith('/api/') || pathname === apiDocsPath || pathname === metricsPath
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
      }
    },
    {
      // Runs after every other buildApp hook (Start's client and ssr builds
      // included), so the standalone assert sees the whole dist tree.
      name: 'effect-standalone-finish',
      enforce: 'post' as const,
      async buildApp(_builder: ViteBuilder) {
        if (!standaloneMode) return
        assertNoExternalImports(distDir)
        copyNativeBinding(distDir)
        writeOxfile(distDir, pkg.name)
      }
    }
  ]
}
