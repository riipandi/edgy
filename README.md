# Edgy

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.22-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

A small, opinionated reference server built with [Effect](https://effect.website) for typed errors,
dependency injection, HTTP routing, middleware, structured logging, and telemetry. [Kysely](https://kysely.dev)
provides the query builder over SQLite through Node's built-in `node:sqlite` driver.

It also serves HTML pages: server-rendered [Solid](https://v2.solidjs.com) components with a
file-based router, styled with [StyleX](https://stylexjs.com/), interactive where they need to be.
[Vite](https://vite.dev) builds the server and browser assets; the standalone mode bundles server
dependencies into one JavaScript entry.

## Features

- **Typed failures** — persistence errors stay in Effect's error channel and are mapped to sanitized HTTP responses.
- **Small JSON API** — health and user routes return JSON responses without an envelope layer.
- **Effect HTTP stack** — routes, middleware, and the Node.js HTTP server use Effect's HTTP platform.
- **Built-in middleware** — request IDs, request logging, and configurable rate limiting.
- **Observable** — Effect exports OpenTelemetry traces, metrics, and optional logs over OTLP.
- **Configurable** — grouped, validated environment configuration controls the server, SQLite, cache, rate limit, logging, and telemetry.
- **Resilient** — typed database errors, bounded in-memory caching and rate limiting, graceful shutdown.
- **Zero native dependencies** — SQLite via `node:sqlite`, so the bundle needs no compiled addon.
- **Server-rendered pages** — streamed Solid pages with a file-based router, hydrated where they are interactive, with typed, build-time styles.
- **Standalone build** — Vite builds the Node.js server and browser assets; `--minify` reduces the server bundle.
- **Standalone bundle** — `vpr build:standalone` produces one executable JavaScript entry.

## Requirements

- **Node.js >= 24.22** — required for the stable `node:sqlite` and native TypeScript stripping.
- **pnpm 12** — declared via `devEngines`; `npx` is intentionally rejected.

## Getting started

```bash
vp install
vpr app migrate:up       # create the users table
vpr app migrate:seed     # insert sample rows (idempotent)
vpr dev                  # http://localhost:3000, pages update live, server code reloads
vpr test                 # run the test suite
vpr compose:up           # local ClickStack collector and UI for telemetry
```

Settings are optional environment variables. See [Configuration](./docs/configuration.md) for names,
defaults, and validation rules.

Verify it is up:

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}

curl 'http://localhost:3000/api/users?limit=10'
# {"status":"success","data":[{"id":"user_01m5k7w3p8fvx9r2c4t6y0hq1d","email":"ada@example.com","name":"Ada Lovelace"}, ...],"metadata":{...},"links":{...}}
```

## Documentation

The full documentation index lives in [docs/index.md](./docs/index.md):

| Document                                 | What it covers                                             |
| ---------------------------------------- | ---------------------------------------------------------- |
| [CLI](./docs/commandline.md)             | Commands, flags, confirmation and dry-run behaviour        |
| [Configuration](./docs/configuration.md) | Environment variables, defaults, examples                  |
| [API endpoints](./docs/api-endpoint.md)  | Endpoint list, request ID tracing, the OpenAPI description |
| [Development](./docs/development.md)     | Day-to-day commands, database workflow, validation         |
| [Deployment](./docs/deployment.md)       | Node.js server and bundled assets                          |

## References

- Effect — [getting started](https://effect.website/docs/v4/getting-started) · [Config](https://effect.website/docs/v4/api/effect/Config) · [Logger](https://effect.website/docs/v4/api/effect/Logger) · [Schema](https://effect.website/docs/v4/api/effect/Schema) · [CLI](https://effect.website/docs/v4/api/effect/cli/Command)
- Effect HTTP — [HTTP APIs](https://effect.website/docs/v4/platform/http)
- Kysely — [documentation](https://kysely.dev)
- Frontend — [Solid](https://v2.solidjs.com) · [Solid Router](https://v2.solidjs.com/routing/solid-router) · [Vite](https://vite.dev/guide/) · [StyleX](https://stylexjs.com/)
- Node.js — [`node:sqlite`](https://nodejs.org/api/sqlite.html) · [single executable applications](https://nodejs.org/api/single-executable-applications.html)

## License

This project licensed under the [MIT License](https://choosealicense.com/licenses/mit).
See the [LICENSE](./LICENSE) file for more information.

---

<sub>If you like my work, you can support me via [GitHub sponsors](https://github.com/sponsors/riipandi).</sub>

[![Creator Badge](https://badgen.net/badge/icon/by%20Aris%20Ripandi?label&color=black&labelColor=black)](https://twitter.com/intent/follow?screen_name=riipandi)
