---
status: living
updated: 2026-10-23T07:45:00+07:00
references: plan-20261023_0105
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

## Kysely statement cache over `node:sqlite`

- status: parked (unlock: a profile shows SQL compile in a hot path) · updated 2026-10-23
- Measured 2026-10-23: `prepare` + `all` costs 7.22 µs/op against 1.48 µs/op when the statement is
  reused — the prepare step is ~5.7 µs, roughly 4.9x the execution cost of a trivial indexed read.
- Kysely's SQLite driver prepares per `executeQuery` (`kysely/dist/dialect/sqlite/sqlite-driver.js`),
  so the cost is the driver's, not this tree's. Fixing it means replacing the driver or adding a
  statement cache keyed by SQL text inside `src/database/dialect/sqlite.ts`.
- First move: profile a request under load before paying that complexity; at 5.7 µs per query the
  database round trip is not yet the bottleneck.
