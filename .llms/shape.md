# Repository shape

## Stack

Edgy is a TypeScript ESM application running on Node.js 24 or newer. `effect` and `@effect/platform-node` provide the effect runtime and HTTP server; Kysely uses Node's `node:sqlite` driver. Solid renders the page routes, and Vite builds the browser and server assets.

## Source layout

| Path                               | Responsibility                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `src/main.ts`, `src/command/`      | Process entry point and CLI commands.                                        |
| `src/layers.ts`                    | Core and application dependency graphs.                                      |
| `src/kernel/`                      | Configuration, HTTP composition, caching, and Solid rendering.               |
| `src/modules/`                     | HTTP-facing health and user features.                                        |
| `src/database/`                    | Kysely schema, SQLite adapter, migrations, seeders, and repository adapters. |
| `src/middleware/`, `src/observer/` | HTTP middleware and logging/telemetry.                                       |
| `src/routes/`, `src/resources/`    | Solid routes, components, and styles.                                        |
| `tests/`                           | HTTP route tests; feature-local tests live beside their source.              |

## Commands

| Command          | Purpose                            |
| ---------------- | ---------------------------------- |
| `pnpm dev`       | Start the Vite development server. |
| `pnpm build`     | Build the application.             |
| `pnpm test`      | Run the configured test suite.     |
| `pnpm typecheck` | Run TypeScript project checking.   |
| `pnpm check`     | Check formatting and lint rules.   |
| `pnpm start`     | Start the built CLI server.        |

The root `package.json` is the source for package manager, runtime, and command versions. No separate porting contract is defined.
