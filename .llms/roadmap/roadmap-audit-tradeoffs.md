---
status: living
updated: 2026-10-29T06:20:00+07:00
references: audit-20261029_0421, plan-20261029_0447
---

# Roadmap — audit tradeoffs parked for a design decision

> Parked findings from the 2026-10-29 whole-system audit: accepted risks
> and best-effort behaviors that need a design decision, not a patch.
> Each entry carries its own status line, the unlock that fires it, the
> verified evidence, and a first move. When an unlock fires, the entry
> re-enters the issue ledger or goes straight to a plan.

## Security posture

### RT-1 — CORS any-origin echo with credentials

_(from audit-20261029_0421 F5)_

- status: parked (unlock: authentication ships) · updated 2026-10-29

Empty `CORS_ALLOWED_ORIGINS` echoes any `Origin` with `credentials: true`
(`src/middleware/cors.ts:31`). The file's own comment documents this as
intentional until auth lands: with no authenticated users there are no
credentials worth stealing, so the permissive default costs nothing today.
The moment authentication ships, any cross site a signed-in user visits can
read the API with that user's credentials.

**Unlock:** the first authenticated endpoint lands — the same change that
creates the exposure removes the excuse for the default.
**First move:** flip the empty-origins default to deny (or echo without
credentials) in `src/middleware/cors.ts` and update the contract line in
`.llms/rules.md`.

### RT-2 — unauthenticated `/metrics` endpoint

_(from audit-20261029_0421 F9)_

- status: parked (unlock: a deployment exposes `/metrics` beyond the
  trust boundary) · updated 2026-10-29

When `METRICS_ENABLED=true`, `/metrics` serves process internals without
authentication and outside the rate limiter (`src/kernel/http/api.ts:23`,
mounted at `src/kernel/http/api.ts:68`). Standard for internal deployments;
the usual control is a bind address or reverse-proxy policy, both of which
are deployment decisions the code cannot make.

**Unlock:** a deployment plan that exposes `/metrics` past the trust
boundary (public ingress, shared network) — until then the endpoint stays
off by default and the exposure is hypothetical.
**First move:** decide the control (network policy vs. an auth middleware
on the metrics route) and record it in `docs/deployment.md` before any
exposed deployment.

## Cache correctness

### RT-3 — cache invalidation is best-effort in redis mode

_(from audit-20261029_0421 F10)_

- status: parked (unlock: a consumer requests a stronger invalidation
  guarantee) · updated 2026-10-29

In redis mode a failed `invalidate` is swallowed and the stale entry serves
until TTL (`src/kernel/cache.ts:87` wraps `Cache.invalidate`, whose
`PersistenceError` is discarded). Bounded by the TTL and consistent with
the cache's best-effort contract; a write-through guarantee would trade
write latency and a new failure mode (writes failing because a cache
flaked) for freshness no current consumer asked for.

**Unlock:** a feature that cannot tolerate TTL-bounded staleness after a
write — named by its owner, not inferred.
**First move:** decide the guarantee shape (retry with backoff, fail the
write, or a generation-key bump) against the requesting feature's latency
budget before touching `src/kernel/cache.ts`.
