# Edgy

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.22-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

A small, opinionated reference server built with [Effect](https://effect.website) for typed errors,
dependency injection, HTTP routing, middleware, structured logging, and telemetry. [Kysely](https://kysely.dev)
provides the query builder over SQLite through Turso's engine — a local file with multi-process WAL support,
or a remote database over HTTP.

It also serves HTML pages: server-rendered [React](https://react.dev) components through
[TanStack Start](https://tanstack.com/start/latest), styled with [StyleX](https://stylexjs.com/),
interactive where they need to be. [Vite](https://vite.dev) builds the server and browser assets;
standalone mode bundles dependencies into a single executable script with optional
[OxMgr](https://github.com/Vladimir-Urik/OxMgr) cluster supervision.

## Features

- **Typed failures** — persistence errors stay in Effect's error channel and map to sanitized HTTP responses.
- **Unified response envelope** — success and error envelopes carrying request IDs, trace IDs, and typed error codes.
- **Effect HTTP stack** — declarative routes, middleware, and the Node.js server use Effect's HTTP platform.
- **Built-in middleware** — TypeID request IDs, token-bucket rate limiting, CORS, security headers, and structured logging.
- **Observable** — exports OpenTelemetry traces and metrics over OTLP into the bundled ClickStack dashboard.
- **Configurable** — typed, startup-validated environment configuration with automated example generation.
- **One database, two transports** — local SQLite file via Turso's native engine (multiprocess WAL), or remote Turso over HTTP.
- **Server-rendered pages** — streamed React 19 pages with file-based routing and zero-runtime StyleX styles.
- **Standalone and clustering** — `vpr build:standalone` emits a self-contained bundle ready for OxMgr multi-worker clustering.

## Requirements

- **Node.js >= 24.22** — required for native TypeScript execution.
- **pnpm 12** — declared via `devEngines`; `npx` is intentionally rejected.

## Getting started

```bash
vp install
vpr app migrate:up       # run database migrations
vpr app migrate:seed     # insert sample fixture data
vpr dev                  # http://localhost:3000 (hot reloading enabled)
vpr test                 # run test suite
vpr compose:up           # local ClickStack collector and UI for telemetry
```

Settings are optional environment variables. See [Configuration](./docs/configuration.md) for defaults and rules.

Verify it is up:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","details":{"database":{"status":"up","timestamp":"2026-10-26T17:00:00.000Z"}}}

curl 'http://localhost:3000/api/users?limit=10'
# {"status":"success","data":[{"id":"user_01m5k7w3p8fvx9r2c4t6y0hq1d","email":"ada@example.com","name":"Ada Lovelace"}, ...],"metadata":{"status_code":200,"request_id":"req_...","limit":10,"has_more":true,"next_cursor":"..."},"links":{"self":"...","first":"...","next":"..."}}
```

## Documentation

The full documentation index lives in [docs/index.md](./docs/index.md):

| Document                                 | What it covers                                            |
| ---------------------------------------- | --------------------------------------------------------- |
| [CLI](./docs/commandline.md)             | Commands, flags, confirmation, and cluster mode           |
| [Configuration](./docs/configuration.md) | Environment variables, defaults, and Compose settings     |
| [API endpoints](./docs/api-endpoint.md)  | Endpoint list, response envelopes, pagination, and errors |
| [Development](./docs/development.md)     | Day-to-day workflow, database migrations, and SSR with TanStack Start |
| [Deployment](./docs/deployment.md)       | Standalone builds, OxMgr process clustering, and Docker   |

## References

- Effect — [getting started](https://effect.website/docs/v4/getting-started) · [Config](https://effect.website/docs/v4/api/effect/Config) · [Logger](https://effect.website/docs/v4/api/effect/Logger) · [Schema](https://effect.website/docs/v4/api/effect/Schema) · [CLI](https://effect.website/docs/v4/api/effect/cli/Command)
- Effect HTTP — [HTTP APIs](https://effect.website/docs/v4/platform/http)
- Kysely — [documentation](https://kysely.dev)
- Frontend — [React](https://react.dev) · [TanStack Start](https://tanstack.com/start/latest) · [TanStack Router](https://tanstack.com/router/latest) · [Vite](https://vite.dev/guide/) · [StyleX](https://stylexjs.com/)
- Database — [Turso](https://turso.tech) · [Kysely dialect](https://github.com/tursodatabase/kysely-libsql)
- Process Manager — [OxMgr](https://github.com/Vladimir-Urik/OxMgr)

## License

This project is licensed under the [MIT License](./LICENSE).

---

<sub>If you like my work, you can support me via [GitHub sponsors](https://github.com/sponsors/riipandi).</sub>

[![Creator Badge](https://badgen.net/badge/icon/by%20Aris%20Ripandi?label&color=black&labelColor=black)](https://twitter.com/intent/follow?screen_name=riipandi)
