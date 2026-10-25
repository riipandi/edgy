---
status: living
updated: 2026-10-24T08:11:00+07:00
references: plan-20261023_0105, audit-20261024_0636
---

# Parked unlocks from the Effect adoption plan

## Browser-side `HttpApiClient`

- status: parked (unlock: the owner asks after measuring the client bundle cost) · updated 2026-10-23
- `src/modules/user/user_fn.ts` is a hand-rolled typed fetch client. `HttpApiClient` would derive it
  from the shared HttpApi contract but pulls an Effect runtime into the browser bundle
  (plan-20261023_0105, decision D1).
- First move: measure the client chunk cost with HttpApiClient in a scratch build, compare against
  `user_fn.ts`, and decide.

## Pocket-id's `TRUSTED_PLATFORM` and `PROXY_PROTOCOL`

- status: parked (unlock: a CDN-fronted or PROXY-protocol deployment appears) · updated 2026-10-23
- The trust-proxy middleware (decision D2) covers the reverse-proxy need with `TRUST_PROXY`; the two
  extra pocket-id knobs have no platform requiring them in this tree.
- First move: when such a deployment appears, port the knob semantics into
  `src/kernel/config/security.ts` and `src/middleware/trust-proxy.ts`.

## Per-command entry points to shrink the CLI cold start

- status: parked (unlock: a measured cold-start budget below ~120 ms) · updated 2026-10-23
- Measured 2026-10-23 on the standalone build: `node -e 0` is 26 ms, `entry.js healthcheck` is 120 ms,
  `entry.js migrate:status` is 122 ms, `entry.js --version` is 117 ms. The ~95 ms above bare Node is
  the shared `effect` chunk (3,344 kB, 937 kB gzip) plus `@effect/platform-node` (872 kB, 222 kB
  gzip) being parsed for every command. `serve` reaches its first listen in ~440 ms.
- Nothing in this tree has a cold-start budget yet, so there is no target to build against. The cost
  is paid once per process, never per request.
- First move: measure the same three commands in the container image, and only split the entry point
  if a budget appears that 120 ms misses.

## Kysely statement cache over the Turso engine

- status: parked (unlock: a profile shows SQL compile in a hot path) · updated 2026-10-25
- Measured 2026-10-23 on `node:sqlite`: `prepare` + `all` costs 7.22 µs/op against 1.48 µs/op when the
  statement is reused — the prepare step is ~5.7 µs, roughly 4.9x the execution cost of a trivial
  indexed read. Measured 2026-10-25 on `@tursodatabase/database`: prepare is ~8 µs, so the swap did
  not change the picture.
- Kysely's driver prepares per `executeQuery`, and `src/database/dialect.ts` keeps that behavior on
  purpose (plan-20261025_0055, D8): a cache would have to live in `TursoExecutor`, keyed by SQL text,
  and every connection in a transaction window would share it. Nothing measured yet pays for it.
- First move: profile a request under load before paying that complexity; at 5.7 µs per query the
  database round trip is not yet the bottleneck.

## `/api/users` publishes every user's email unauthenticated

- status: parked (unlock: the first authenticated endpoint or the first real user data) · updated
  2026-10-24
- `src/modules/user/module.ts`'s `listUsers` maps the full row through `toUserResult`, which keeps
  `email`; with no auth on the API yet this is by design for seed data, but it becomes account
  enumeration plus a PII leak the moment real users exist (audit-20261024_0636, F-06).
- First move: when auth lands, either drop `email` from the public projection or gate the list
  endpoint — and revisit the CORS any-origin default in `src/middleware/cors.ts` in the same pass.
