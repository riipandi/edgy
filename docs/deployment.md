# Deployment

How to build, bundle, and ship the server.

## Building

The `builder/` directory is a small Rolldown pipeline, deliberately independent of the server
source. It bundles the server, keeps native packages external, traces them into the output, and
emits a minimal `package.json` so the result runs without the project's own `node_modules`.

```bash
pnpm build:node      # -> dist/server  (ESM bundle + chunks)
pnpm build:worker    # -> dist/worker/index.mjs  (Cloudflare Worker, one file)
pnpm compile         # -> dist/server + dist/edgy  (single executable, experimental)
```

Flags apply to all three commands:

```bash
pnpm build:node --no-splitting          # one self-contained index.mjs
pnpm build:node --minify                # minify with Rolldown's oxc minifier
pnpm build:node --obfuscate             # obfuscate chunks (javascript-obfuscator)
pnpm build:node --minify --obfuscate    # both
```

Run the bundle anywhere, with no `node_modules` present:

```bash
node dist/server/index.mjs serve
```

## Two targets

The same application runs in two places. The code, routes and configuration are shared; only the
runtime and the database differ.

| Target             | Runtime          | Database             | Built with        |
| ------------------ | ---------------- | -------------------- | ----------------- |
| Node.js server     | Node.js >= 24.22 | SQLite (`node:sqlite`) | `pnpm build:node`   |
| Cloudflare Workers | workerd          | Cloudflare D1        | `pnpm build:worker` |

## Cloudflare Workers

```bash
pnpm watch:worker    # run the source in workerd, rebuilt on every change
pnpm build:worker    # bundle into dist/worker/index.mjs (one file)
pnpm preview         # build a minified bundle, then run that exact file in workerd
pnpm deploy          # build a minified bundle, then publish that exact file with wrangler
```

`pnpm build:worker` is `pnpm build:node`'s counterpart: the same builder with `--target=workers`
(`node` or `workers`, default `node`). The Worker build is a single file with Node's built-ins
(`node:async_hooks`) left as imports, which Cloudflare provides through the `nodejs_compat` flag.
`--minify` and `--obfuscate` work for both targets; `pnpm compile` (single executable) is Node.js only.

`pnpm watch:worker` is the fast loop: wrangler bundles the source itself on every change.
`pnpm preview` runs the artifact you will actually ship, minified exactly as `pnpm deploy` builds it,
so run it before deploying.

Before the first deploy:

1. Create the database: `wrangler d1 create edgy`, then put the printed id in `wrangler.jsonc`
   (`d1_databases[0].database_id`).
2. Put application settings under `vars` in `wrangler.jsonc` and secrets in `wrangler secret put`.
   See [Configuration](./configuration.md).
3. Decide how migrations are applied. `DATABASE_AUTO_MIGRATE=true` applies them when an isolate
   starts, which is convenient for preview. Several isolates can start at once and race, so for
   production prefer to apply the schema once, before deploying.

Differences from the Node.js server:

- D1 has no interactive transactions, so code that needs one fails with a database error.
- Rate limiting is counted per isolate, not globally.
- Logs go straight to the platform's log stream (`console`), without batching.
- Set `TRUST_PROXY=true`: Cloudflare always sets `CF-Connecting-IP`, and without it every client shares
  one rate-limit bucket.

## Scaling the Node.js server

One process serves roughly 10,000 list requests (20 rows each) per second on a laptop, and SQLite access is
synchronous, so a slow query holds up every other request on that process. To go further, run several
processes (SQLite's WAL mode lets them read and write the same file) behind a reverse proxy, and set
`TRUST_PROXY=true`. Rate limits then apply to each process separately.

Behind a load balancer, set `SHUTDOWN_DRAIN_DELAY` to a few seconds: on a stop signal `/health`
answers `503` first, and the server closes the listener only after that pause, so the balancer stops
sending traffic before connections are refused.

## Build configuration

`builder/builder.config.ts` is optional; every field has a sensible default. Common options:

| Option            | Default             | Description                                                  |
| ----------------- | ------------------- | ------------------------------------------------------------ |
| `entry`           | `src/main.ts`       | Server entry point                                           |
| `outDir`          | `dist`              | Build output root                                            |
| `splitting`       | `true`              | Split shared code into chunks                                |
| `splitPackages`   | `true`              | One chunk per dependency instead of a single `vendor` chunk  |
| `chunkGroups`     | `[]`                | Extra chunk groups (e.g. group `effect` separately)          |
| `minify`          | `false`             | Minify the bundles                                           |
| `obfuscate`       | `false`             | Obfuscate the bundles                                        |
| `external`        | native packages     | Packages kept external and traced into the output            |
| `seaConfig`       | `{ enable: false }` | Single executable options (see below)                        |
| `rolldownOptions` | `{}`                | Escape hatch, deep-merged over the builder's Rolldown config |

> [!TIP]
> `rolldownOptions` is merged (arrays concatenate), so extra plugins append instead of replacing
> the builder's externals plugin:
>
> ```ts
> rolldownOptions: {
>   resolve: { alias: { '#': './src' } },
>   output: { comments: false }
> }
> ```

## Single executable

`pnpm compile` bundles the server as one CommonJS file, generates a preparation blob with
`node --experimental-sea-config`, and injects it into a copy of the running `node` binary using
[postject](https://github.com/nodejs/postject).

```bash
pnpm compile
./dist/edgy serve
```

The compiler is driven by `seaConfig` in `builder.config.ts`:

```ts
seaConfig: {
  enable: false,                      // set by the `compile` command
  fileName: 'edgy',                   // -> dist/edgy (.exe on Windows)
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  useSnapshot: false,
  execArgv: [],
  execArgvExtension: 'env',           // 'none' | 'env' | 'cli'
  assets: {},                         // key -> path, readable via node:sea
  target: undefined                   // e.g. 'linux-x64'; defaults to the host
}
```

> [!IMPORTANT]
> Node marks Single Executable Applications as **experimental** (stability 1.1). The generated
> binary:
>
> - embeds the Node runtime, so expect **~120 MB**;
> - **cannot be cross-compiled** — it only runs on the platform that built it;
> - is supported on Windows, macOS (arm64) and Linux (except Alpine and s390x).
>
> On macOS the compiler strips and re-signs the binary ad-hoc around the injection step; if there
> are external native addons, embed them through `seaConfig.assets` and load them with
> `process.dlopen`. This project uses `node:sqlite`, so the output has no external dependencies.
