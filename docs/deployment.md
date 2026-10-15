# Deployment

How to build, bundle, and ship the server.

## Building

[Vite](https://vite.dev) builds both targets: the server (or Worker) and the browser assets, in one
run (`vite build --app`). After it, one small step makes the Node entry executable and writes a
minimal `package.json`, so the result runs without the project's own `node_modules`. Only the single
executable is a separate command.

```bash
pnpm build                  # -> dist/server  (index.mjs + public/ for the browser)
pnpm build --mode worker    # -> dist/worker  (index.js + public/ for the browser)
pnpm compile                # -> dist/edgy  (single executable, experimental)
```

`dev`, `build` and `preview` are Vite's own commands, and `--mode worker` makes any of them the
Worker's (Vite's `--mode` is the one switch its command line passes to the configuration). Left out,
it is the Node server. Every other Vite option works as on Vite: `pnpm build --minify`,
`pnpm dev --port 3001`.

`--minify` is Vite's own flag, so it works on any of them (`pnpm build --minify`); the browser assets
are always minified.

Run the build anywhere, with no `node_modules` present:

```bash
node dist/server/index.mjs serve
./dist/server/index.mjs serve   # the Node entry is executable and starts with a shebang
```

The server finds its browser assets in `public/`, next to `index.mjs`, so keep the two together
when you copy the build. The Worker entry (`dist/worker/index.js`) is not executable: the platform
loads it, nothing runs it.

## Two targets

The same application runs in two places. The code, routes and configuration are shared; only the
runtime and the database differ.

| Target             | Runtime          | Database             | Built with        |
| ------------------ | ---------------- | -------------------- | ----------------- |
| Node.js server     | Node.js >= 24.22 | SQLite (`node:sqlite`) | `pnpm build`   |
| Cloudflare Workers | workerd          | Cloudflare D1        | `pnpm build --mode worker` |

## Cloudflare Workers

```bash
pnpm dev --mode worker       # run the source in workerd, with hot updates
pnpm build --mode worker     # build into dist/worker (the Worker and, in public/, the browser assets)
pnpm preview --mode worker   # run the Worker built in dist/worker, in workerd (build it first)
pnpm run deploy              # build a minified Worker, then publish it with wrangler
```

The Worker is the same Vite configuration with `--mode worker`. Vite's Cloudflare plugin
reads `wrangler.jsonc` and writes the configuration that `wrangler deploy` uses, including the
browser assets, which Cloudflare serves itself without starting the Worker. Node's built-ins
(`node:async_hooks`) stay imports, which Cloudflare provides through the `nodejs_compat` flag.
`--minify` works for both targets; `pnpm compile` (single executable) is Node.js only.

`pnpm dev --mode worker` is the fast loop. `pnpm preview --mode worker` runs the artifact you will
actually ship: build it the way `pnpm run deploy` does (`pnpm build --mode worker --minify`), then preview it.

Local secrets and overrides for the Worker go in `.dev.vars` (Wrangler's own file, ignored by git).
`.env.local` is for the Node.js server and is deliberately not read for the Worker: it would
override the variables in `wrangler.jsonc`.

Before the first deploy:

1. Create the database: `wrangler d1 create edgy`, then put the printed id in `wrangler.jsonc`
   (`d1_databases[0].database_id`).
2. Put application settings under `vars` in `wrangler.jsonc` and secrets in `wrangler secret put`.
   See [Configuration](./configuration.md).
3. Create the schema. `wrangler.jsonc` sets `DATABASE_AUTO_MIGRATE` to `true`, so the first request
   to a new database applies the migrations, locally and when deployed. Several isolates starting at
   once can race on that first migration, and a preview upload shares these settings, so once the
   schema exists switch it off for deployments: `pnpm run deploy --var DATABASE_AUTO_MIGRATE:false`.

Differences from the Node.js server:

- D1 has no interactive transactions, so code that needs one fails with a database error.
- Cached reads are kept per isolate with `CACHE_STORE=memory`, or per location in Cloudflare's Cache API with `CACHE_STORE=cloudflare` (the default in `wrangler.jsonc`); the Cache API stores nothing on `*.workers.dev`, so use a custom domain for it to have an effect.
- Rate limiting is counted per isolate with `memory`, and per Cloudflare location with `RATE_LIMIT_STORE=cloudflare`, which uses the `ratelimits` binding in `wrangler.jsonc` (allowance and period are set there). Neither is an exact global quota.
- Logs go straight to the platform's log stream (`console`), without batching.
- Set `TRUSTED_PLATFORM=CF-Connecting-IP` (`wrangler.jsonc` does): a Worker has no socket address, and
  without it every client shares one rate-limit bucket.

## Scaling the Node.js server

One process serves roughly 10,000 list requests (20 rows each) per second on a laptop, and SQLite access is
synchronous, so a slow query holds up every other request on that process. To go further, run several
processes (SQLite's WAL mode lets them read and write the same file) behind a reverse proxy, and set
`TRUST_PROXY` to your proxy's address or network (see [Configuration](./configuration.md#behind-a-reverse-proxy)). Rate limits then apply to each process separately.

Behind a load balancer, set `SHUTDOWN_DRAIN_DELAY` to a few seconds: on a stop signal `/health`
answers `503` first, and the server closes the listener only after that pause, so the balancer stops
sending traffic before connections are refused.

## Telemetry and overload

The defaults of `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` and `REDIS_URL` are the
local development stack. In production set your own (the collector's URL and key, your Redis), or set
`OTEL_SDK_DISABLED=true` if there is no collector; add `otlp` to `LOG_TRANSPORT` to send logs too. In production keep the ratio under control with `OTEL_TRACES_SAMPLE_RATIO`: recording every
request costs a few percent of throughput (about 7% on a laptop at full sampling), and a tenth of that
is rarely a loss. If the collector is unreachable, export pauses and drops its buffer; requests are
unaffected.

Rate limiting is on by default (`RATE_LIMIT_ENABLED`). Behind several instances, set `RATE_LIMIT_STORE=redis` with a `REDIS_URL` so the rate limit is shared,
not multiplied. `MAX_IN_FLIGHT` caps the requests one process handles at once; past it the server answers
`503` straight away, which lets a load balancer retry elsewhere instead of every request slowing down.

## Build configuration

Bundling is configured in one file, `vite.config.ts`, which serves both targets (`--mode worker`
selects the Worker). It is an ordinary Vite configuration, so Vite's own flags apply (`--minify`), and
so does anything you add to it (`server`, `build`, `resolve`, more plugins): what you set there wins
over the defaults of the project's Vite plugin. There is nothing else to set.

The Node.js server is one bundle with its dependencies inlined. A dependency that ships a native
addon cannot be bundled that way; none of the current dependencies do (the database is
`node:sqlite`).

## Single executable

`pnpm compile` builds the server as one CommonJS file together with the browser assets, generates a
preparation blob with `node --experimental-sea-config`, and injects it into a copy of the running
`node` binary using [postject](https://github.com/nodejs/postject). The browser assets travel inside
the executable, so it serves its own pages with nothing beside it.

```bash
pnpm compile
./dist/edgy serve
```

> [!IMPORTANT]
> Node marks Single Executable Applications as **experimental** (stability 1.1). The generated
> binary:
>
> - embeds the Node runtime, so expect **~120 MB**;
> - **cannot be cross-compiled** — it only runs on the platform that built it;
> - is supported on Windows, macOS (arm64) and Linux (except Alpine and s390x).
>
> On macOS the compiler strips and re-signs the binary ad-hoc around the injection step. This
> project uses `node:sqlite`, so the output has no external dependencies.
