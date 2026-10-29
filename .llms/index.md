# Documentation map

| Document                             | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| [shape.md](./shape.md)               | Repository layout, stack, verified commands, and topology.     |
| [rules.md](./rules.md)               | Implemented contracts, change recipes, and mechanical traps.   |
| [architecture.md](./architecture.md) | Runtime composition, layer graphs, and subsystem boundaries.   |
| [api-response.md](./api-response.md) | Canonical API response and error envelope specification.       |
| [effect-docs.md](./effect-docs.md)   | Effect v4 documentation references and pinned modules.         |
| [plans/](./plans/)                   | Execution contracts for pending or in-progress changes (empty — completed plans live in [archive/](./archive/)). |
| [audit/](./audit/)                   | Evidence-based audits. Newest: [audit-20261029_0650](./audit/audit-20261029_0650.md) (whole system, second pass — resolved), [audit-20261029_0421](./audit/audit-20261029_0421.md) (whole system, resolved), [audit-20261027_2042](./audit/audit-20261027_2042.md) (behaviour logging), [audit-20261027_1835](./audit/audit-20261027_1835.md) (TanStack Start SSR configuration), [audit-20261027_1759](./audit/audit-20261027_1759.md) (React migration surface). |
| [issues/](./issues/)                 | Live findings that outlive a session (empty — resolved issues live in [archive/](./archive/)). |
| [roadmap/](./roadmap/)               | Parked improvements with explicit triggers. Newest: [roadmap-audit-tradeoffs](./roadmap/roadmap-audit-tradeoffs.md) (CORS default, `/metrics` exposure, cache invalidation guarantee). |
| [handover/](./handover/)             | Session compactions and wave summaries. Newest: [handover-20261029_0705](./handover/handover-20261029_0705.md) (audit-20261029_0650 fix round), [handover-20261029_0630](./handover/handover-20261029_0630.md) (audit-fix plan), [handover-20261027_2132](./handover/handover-20261027_2132.md) (behaviour logging), [handover-20261027_1935](./handover/handover-20261027_1935.md). |
| [archive/](./archive/)               | Terminal ledger documents. Newest: [plan-20261029_0653](./archive/plan-20261029_0653.md) (audit-20261029_0650 fix round), [plan-20261029_0447](./archive/plan-20261029_0447.md) (2026-10-29 audit fixes), [plan-20261027_2042](./archive/plan-20261027_2042.md) (behaviour logging), [plan-20261027_1935](./archive/plan-20261027_1935.md), [handover-20261027_1835](./archive/handover-20261027_1835.md), [plan-20261027_1835](./archive/plan-20261027_1835.md). |
| [docs/](../docs/index.md)            | Human-facing setup, API, configuration, and operations guides. |

The source tree is authoritative when it disagrees with a guide. Scaffolds and future features are not implemented surfaces.
