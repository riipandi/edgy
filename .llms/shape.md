# Repository shape

## Stack

Edgy is a TypeScript ESM application running on Node.js 24 or newer. `effect` and `@effect/platform-node` provide the effect runtime and HTTP server; Kysely talks to SQLite through a dialect over Turso's SDKs — `@tursodatabase/database` for a local file, `@tursodatabase/serverless` over HTTP for a remote database. Solid renders the page routes, and Vite builds the browser and server assets.

## Source layout

| Path                               | Responsibility                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/main.ts`, `src/command/`      | Process entry point and CLI commands.                                                     |
| `src/layers.ts`                    | Core and application dependency graphs.                                                   |
| `src/kernel/`                      | Configuration, HTTP composition, and Solid rendering.                                     |
| `src/modules/`                     | Health and user features, including their repository implementations.                     |
| `src/database/`                    | Kysely schema, the Turso dialect, migrations, and seeders.                                |
| `src/middleware/`, `src/observer/` | HTTP middleware and logging/telemetry.                                                    |
| `src/routes/`, `src/resources/`    | Solid routes, components, and styles.                                                     |
| `tests/`                           | API route, middleware, and shared fixtures; feature-local tests live beside their source. |

## Commands

| Command         | Purpose                            |
| --------------- | ---------------------------------- |
| `vpr dev`       | Start the Vite development server. |
| `vpr build`     | Build the application.             |
| `vpr test`      | Run the configured test suite.     |
| `vpr typecheck` | Run TypeScript project checking.   |
| `vpr check`     | Check formatting and lint rules.   |
| `vpr start`     | Start the built CLI server.        |

Commands run through the `vpr` task runner (`vpr <script>`); `vpr app <command>` reaches the application CLI from source. The root `package.json` is the source for package manager, runtime, and command versions. No separate porting contract is defined.

A container build passes `--build-arg DISTROLESS_TAG=debug-nonroot` (compose does it through `APP_DISTROLESS_TAG`). The bundle's shebang is `#!/busybox/env node`, baked from the build stage's `ENV_BINARY_PATH`, and only the `debug` distroless variants ship `/busybox`; an image built from the plain `nonroot` tag starts with `exec /app/entry.js failed: No such file or directory`.
