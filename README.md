# Edgy

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24.22-3c873a?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/en/download)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](./tsconfig.json)
[![Turso](https://img.shields.io/badge/Turso-v0.8-07b089?style=flat-square&logo=turso&logoColor=white)](https://turso.tech)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![Contribution](https://img.shields.io/badge/Contributions%20Welcome-2c2f38?style=flat-square&logo=lightning&logoColor=white)](./CONTRIBUTING.md)
<!--[![Release](https://img.shields.io/github/v/release/riipandi/edgy?style=flat-square&logo=docker&color=orange)](https://github.com/riipandi/edgy/releases)-->
<!--[![Test](https://github.com/riipandi/edgy/actions/workflows/test.yml/badge.svg)](https://github.com/riipandi/edgy/actions/workflows/test.yml)-->

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

- **Node.js >= 24.22** — the application runtime.
- **pnpm 12.14** — declared via `devEngines`.
- **Vite+ >= 1.0** — the unified toolchain.

## Getting started

```bash
vp install               # install dependencies
vpr compose:up           # local development stack
vpr app migrate:up       # run database migrations
vpr app migrate:seed     # insert sample fixture data
vpr dev                  # http://localhost:3000 (hot reloading enabled)
vpr test                 # run test suite
```

Settings are optional environment variables. See [Configuration](./docs/configuration.md) for defaults and rules.

## Documentation

Refer to [docs/index.md](./docs/index.md) for more detailed documentation.

## Contributions

Contributions are welcome! Please open a pull requests for your changes and tickets
in case you would like to discuss something or have a question.

## License

This project is licensed under the [MIT License](./LICENSE).

---

<sub>If you like my work, you can support me via [GitHub sponsors](https://github.com/sponsors/riipandi).</sub>

[![Creator Badge](https://badgen.net/badge/icon/by%20Aris%20Ripandi?label&color=black&labelColor=black)](https://twitter.com/intent/follow?screen_name=riipandi)
