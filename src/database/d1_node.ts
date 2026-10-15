import { Effect, Layer } from 'effect'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { ConfigService } from '../kernel/config/service.ts'
import { DatabaseError } from '../kernel/errors.ts'
import { D1Binding, isD1Database } from './d1.ts'
import { withRemoteD1 } from './wrangler_config.ts'

/** Kept in a variable: a literal `import('wrangler')` would bundle wrangler and miniflare (about 20 MB). */
const WRANGLER = 'wrangler'

/** The Wrangler configuration files, in the order Wrangler itself prefers them. */
const WRANGLER_CONFIGS = ['wrangler.jsonc', 'wrangler.json'] as const

/**
 * A copy of the project's Wrangler configuration with the D1 binding marked remote, beside the
 * original (paths in it are relative to its directory), removed when the scope closes.
 */
const remoteConfig = (binding: string) =>
  Effect.acquireRelease(
    Effect.try({
      try: () => {
        const source = WRANGLER_CONFIGS.find((name) => existsSync(name))
        if (source === undefined) {
          throw new Error('--remote needs a wrangler.jsonc (or wrangler.json) in the project root')
        }
        const target = `wrangler.remote-${process.pid}.tmp.json`
        writeFileSync(target, withRemoteD1(readFileSync(source, 'utf8'), binding))
        return target
      },
      catch: (cause) => new DatabaseError({ cause })
    }),
    (target) => Effect.sync(() => rmSync(target, { force: true }))
  )

/**
 * D1 binding for Node, from wrangler's platform proxy (miniflare). It reads the same
 * `wrangler.jsonc` and persisted state as `wrangler dev`, so a migration run here prepares the
 * database the worker mode serves. With `remote` it reaches the real database the binding names
 * instead, through the account `wrangler login` signed in to.
 *
 * wrangler is a development dependency, imported lazily so the Node server never loads it.
 */
export const d1BindingNodeLayer = (
  options: { readonly remote?: boolean } = {}
): Layer.Layer<D1Binding, DatabaseError, ConfigService> =>
  Layer.effect(
    D1Binding,
    Effect.gen(function* () {
      const { database } = yield* ConfigService
      const configPath =
        options.remote === true ? yield* remoteConfig(database.d1Binding) : undefined

      const proxy = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const wrangler: typeof import('wrangler') = await import(/* @vite-ignore */ WRANGLER)
            return wrangler.getPlatformProxy({
              ...(configPath === undefined ? {} : { configPath }),
              remoteBindings: options.remote === true
            })
          },
          catch: (cause) => new DatabaseError({ cause })
        }),
        (platform) => Effect.promise(() => platform.dispose())
      )

      const binding: unknown = proxy.env[database.d1Binding]
      if (!isD1Database(binding)) {
        return yield* new DatabaseError({
          cause: new Error(
            `No D1 binding named "${database.d1Binding}" in wrangler.jsonc (set D1_BINDING)`
          )
        })
      }
      return binding
    })
  )
