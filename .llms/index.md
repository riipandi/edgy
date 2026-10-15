# LLM Documentation Index

The documentation map. Read AGENTS.md first, then this file, then the document a task touches.

| Document | What it holds |
| --- | --- |
| [`shape.md`](./shape.md) | Repository shape: layout, toolchain, commands, conventions |
| [`rules.md`](./rules.md) | Contracts, how-to-change recipes, traps |
| [`architecture.md`](./architecture.md) | How the system is built today, per area (no history) |
| [`plans/`](./plans/) | Executable plans (owner-approved contracts) — empty |
| [`issues/`](./issues/) | Findings that outlive a turn — `issue-20261015_2230.md` (open) |
| [`roadmap/`](./roadmap/) | Parked improvements with unlock triggers — empty |
| [`handover/`](./handover/) | Session compactions — empty |
| [`audit/`](./audit/) | Point-in-time review records — empty |
| [`archive/`](./archive/) | Terminal-status documents, flat, under their original names — empty |

## Implemented surfaces

- HTTP server (h3 v2): `/` and `/health` at the root, `/metrics` (flagged), `/api/users` (paginated list, get, create answering 201) in the response envelope, `/.well-known/security.txt`; security headers, JSON-only bodies, rate limiting (off by default; per process or shared through Redis), overload guard — see `rules.md` ("HTTP contracts")
- CLI (`effect/cli`): `serve [--auto-migrate]`, `config:generate [--check]`, `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`, `migrate:seed` — see `rules.md` ("CLI contracts")
- Database: `node:sqlite` or Cloudflare D1 (`DATABASE_DRIVER`) behind one `DatabaseService`, custom Kysely dialects, transactions (sqlite), static-registry migrator, idempotent seeders
- Targets: a Node.js server and a Cloudflare Worker (`pnpm watch:worker`, `pnpm preview`) over the same application — see `architecture.md` ("Shape of the system") — see `rules.md` ("Database contracts")
- Observability: non-blocking batched logger (`pretty`/`json`; console, rotating JSON file, OTLP), OTLP traces and metrics (ClickStack/HyperDX in development via `compose.yaml`), `trace_id` in the envelope, error reporter, request log + HTTP metrics — see `rules.md` ("Observability contracts")

Human-facing documentation lives in `docs/`: `commandline.md`, `configuration.md`, `api-endpoint.md`.

## Recap

Tests: Vitest, `pnpm test` (see `rules.md`, "Traps"). Open items live in `.llms/issues/`.
