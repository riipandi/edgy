# LLM Documentation Index

The documentation map. Read AGENTS.md first, then this file, then the document a task touches.

| Document | What it holds |
| --- | --- |
| [`shape.md`](./shape.md) | Repository shape: layout, toolchain, commands, conventions |
| [`rules.md`](./rules.md) | Contracts, how-to-change recipes, traps |
| [`architecture.md`](./architecture.md) | Per-area reasoning and decision records |
| [`plans/`](./plans/) | Executable plans (owner-approved contracts) — empty |
| [`issues/`](./issues/) | Findings that outlive a turn — empty |
| [`roadmap/`](./roadmap/) | Parked improvements with unlock triggers — empty |
| [`handover/`](./handover/) | Session compactions — empty |
| [`audit/`](./audit/) | Point-in-time review records — empty |
| [`archive/`](./archive/) | Terminal-status documents, flat, under their original names — empty |

## Implemented surfaces

- HTTP server (h3 v2): health, users CRUD (create answers 201), `/.well-known/security.txt` — see `rules.md` ("HTTP contracts")
- CLI (`effect/cli`): `serve [--auto-migrate]`, `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`, `migrate:seed` — see `rules.md` ("CLI contracts")
- Database: `node:sqlite` via a custom Kysely dialect, static-registry migrator, idempotent seeders — see `rules.md` ("Database contracts")
- Observability: non-blocking batched logger (`pretty`/`json`), request log + HTTP metrics — see `rules.md` ("Observability contracts")

Human-facing documentation lives in `docs/`: `commandline.md`, `configuration.md`, `api-endpoint.md`.

## Recap

No live plans or issues. The `test` script is a placeholder (`echo "Error: no test specified"`) — the project has no test suite; validation is `pnpm typecheck` + `pnpm check` + a runtime probe (see `shape.md`).
