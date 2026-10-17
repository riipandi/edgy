# LLM Documentation Index

The documentation map. Read AGENTS.md first, then this file, then the document a task touches.

| Document | What it holds |
| --- | --- |
| [`shape.md`](./shape.md) | Repository shape: layout, toolchain, commands, conventions |
| [`rules.md`](./rules.md) | Contracts, how-to-change recipes, traps |
| [`architecture.md`](./architecture.md) | How the system is built today, per area (no history) |
| [`plans/`](./plans/) | Executable plans (owner-approved contracts) — empty |
| [`issues/`](./issues/) | Findings that outlive a turn — `issue-20261015_2230.md` (open) |
| [`roadmap/`](./roadmap/) | Parked improvements with unlock triggers — `roadmap-20261016_0809.md` (Marko streaming, lazy loading, patch protocol) |
| [`handover/`](./handover/) | Session compactions — empty |
| [`audit/`](./audit/) | Point-in-time review records — empty |
| [`archive/`](./archive/) | Terminal-status documents, flat, under their original names — `issue-20261016_0151.md` (the full audit) |

## Implemented surfaces

- HTML pages: `GET /users` (server-rendered Marko, one interactive component, Panda CSS styles), `/assets/**` for the built browser files; build, `pnpm dev`, SEA and Worker all carry the pages — see `rules.md` ("Frontend contracts")
- HTTP server (h3 v2): `/` and `/health` at the root, `/metrics` (flagged), `/api/users` (paginated list, get, create answering 201) in the response envelope, `/.well-known/security.txt`; security headers, JSON-only bodies, rate limiting (on by default; per process, shared through Redis, or Cloudflare's binding), a configurable read cache (memory, Redis or the Workers Cache API), overload guard — see `rules.md` ("HTTP contracts")
- CLI (`effect/cli`): `serve [--auto-migrate]`, `config:generate [--check]`, `openapi:generate [--check]`, `migrate:up`, `migrate:down`, `migrate:status`, `migrate:reset`, `migrate:seed` — see `rules.md` ("CLI contracts")
- Database: `node:sqlite` or Cloudflare D1 (`DATABASE_DRIVER`) behind one `DatabaseService`, custom Kysely dialects, static-registry migrator, idempotent seeders
- Targets: a Node.js server and a Cloudflare Worker (`pnpm dev --mode worker`, `pnpm preview --mode worker`) over the same application — see `architecture.md` ("Shape of the system") — see `rules.md` ("Database contracts")
- Observability: non-blocking batched logger (`pretty`/`json`; console, rotating JSON file, OTLP), OTLP traces and metrics (ClickStack/HyperDX in development via `compose.yaml`), `trace_id` in the envelope, error reporter, request log + HTTP metrics — see `rules.md` ("Observability contracts")

Human-facing documentation lives in `docs/`: `commandline.md`, `configuration.md`, `api-endpoint.md`, `frontend.md`, `development.md`, `deployment.md`.

## Recap

Tests: Vitest, `pnpm test` (see `rules.md`, "Traps"). Open items live in `.llms/issues/`.
