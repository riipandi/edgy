---
status: living
updated: 2026-10-23T03:45:00+07:00
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
