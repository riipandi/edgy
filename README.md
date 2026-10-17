# Edgy

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.22-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

A small, opinionated reference server that shows how to wire [Effect](https://effect.website) (typed
errors, dependency injection, structured logging) to [H3](https://h3.dev) (routing, middleware) and
[Kysely](https://kysely.dev). The same code runs on Node.js (Node's built-in `node:sqlite`) and on
Cloudflare Workers ([D1](https://developers.cloudflare.com/d1/)); a setting picks the database.

It also serves HTML pages: server-rendered [Marko](https://markojs.com) templates, styled with
[Panda CSS](https://panda-css.com), interactive where they need to be. [Vite](https://vite.dev)
builds everything into a standalone bundle with no `node_modules` at runtime, and the build can optionally
compile a single executable using Node's [Single Executable Applications](https://nodejs.org/api/single-executable-applications.html) API.

## Features

- **Typed end to end** — handlers return `Effect<A, AppError, HttpEnv>`; each error carries its own HTTP status.
- **One response format** — every API response is a documented envelope, with built-in pagination.
- **Plugin-based routing** — route groups and middleware are H3 plugins, composed in one place.
- **Built-in middleware** — request ID (TypeID), structured request logger, security headers, rate limiting and configurable CORS.
- **Observable** — OpenTelemetry traces, metrics and logs over HTTP (ClickStack/HyperDX in development), with the trace id returned to the caller.
- **Resilient** — overload guard, retried reads on D1, a rate limit that can be shared across instances and fails open, graceful shutdown.
- **Two targets** — a Node.js server and a Cloudflare Worker (`pnpm dev --mode worker` runs it locally).
- **Zero native dependencies** — SQLite via `node:sqlite`, so the bundle needs no compiled addon.
- **Server-rendered pages** — streamed Marko pages that hydrate only the interactive parts, with typed, build-time styles.
- **One build for both targets** — Vite builds the server and the browser assets for Node.js and Workers; `--minify` for a smaller server.
- **Optional single executable** — `pnpm compile` produces one self-contained binary.

## Requirements

- **Node.js >= 24.22** — required for the stable `node:sqlite` and native TypeScript stripping.
- **pnpm 12** — declared via `devEngines`; `npx` is intentionally rejected.

## Getting started

```bash
pnpm install
pnpm app migrate:up       # create the users table
pnpm app migrate:seed     # insert sample rows (idempotent)
pnpm dev                  # http://localhost:3000, pages update live, server code reloads
pnpm test                 # run the test suite
pnpm dev --mode worker    # the same app as a Cloudflare Worker, locally
pnpm compose:up           # ClickStack (HyperDX) and Valkey in Docker, for telemetry
```

Every setting is an optional environment variable; `pnpm app config:generate` writes `.env.example`
with all of them.

Verify it is up:

```bash
curl http://localhost:3000/health
# {"status":"success","message":"...","metadata":{...}}

curl 'http://localhost:3000/api/users?limit=10'
# {"status":"success","data":[{"id":"user_01m5k7w3p8fvx9r2c4t6y0hq1d","email":"ada@example.com","name":"Ada Lovelace"}, ...],"metadata":{...},"links":{...}}
```

## Documentation

The full documentation index lives in [docs/index.md](./docs/index.md):

| Document                                    | What it covers                                             |
| ------------------------------------------- | ---------------------------------------------------------- |
| [CLI](./docs/commandline.md)                | Commands, flags, confirmation and dry-run behaviour        |
| [Configuration](./docs/configuration.md)    | Environment variables, defaults, examples                  |
| [API endpoints](./docs/api-endpoint.md)     | Endpoint list, request ID tracing, the OpenAPI description |
| [Pages](./docs/frontend.md)                 | Writing a page, styling, how pages are served              |
| [Development](./docs/development.md)        | Day-to-day commands, database workflow, validation         |
| [Deployment](./docs/deployment.md)          | Node.js and Cloudflare Workers targets, bundling           |

## References

- Effect — [getting started](https://effect.website/docs/v4/getting-started) · [Config](https://effect.website/docs/v4/api/effect/Config) · [Logger](https://effect.website/docs/v4/api/effect/Logger) · [Schema](https://effect.website/docs/v4/api/effect/Schema) · [CLI](https://effect.website/docs/v4/api/effect/cli/Command)
- H3 — [guide](https://h3.dev/guide/api/h3) · [event](https://h3.dev/guide/api/h3event) · [middleware](https://h3.dev/guide/basics/middleware) · [plugins](https://h3.dev/guide/advanced/plugins) · [utilities](https://h3.dev/utils)
- Kysely — [documentation](https://kysely.dev)
- Cloudflare — [Workers](https://developers.cloudflare.com/workers/) · [D1](https://developers.cloudflare.com/d1/) · [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
- Frontend — [Marko](https://markojs.com/docs/introduction/getting-started) · [Vite](https://vite.dev/guide/) · [Panda CSS](https://panda-css.com) · [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- Node.js — [`node:sqlite`](https://nodejs.org/api/sqlite.html) · [single executable applications](https://nodejs.org/api/single-executable-applications.html)

## License

This project licensed under the [MIT License](https://choosealicense.com/licenses/mit).
See the [LICENSE](./LICENSE) file for more information.

---

<sub>If you like my work, you can support me via [GitHub sponsors](https://github.com/sponsors/riipandi).</sub>

[![Creator Badge](https://badgen.net/badge/icon/by%20Aris%20Ripandi?label&color=black&labelColor=black)](https://twitter.com/intent/follow?screen_name=riipandi)
