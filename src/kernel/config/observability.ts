import { flag, group, type ValueOf } from './field.ts'

/** Operational endpoints. */
export const observabilityConfig = group(
  {
    metricsEnabled: flag(
      'METRICS_ENABLED',
      false,
      'Serve Prometheus metrics at GET /metrics (unauthenticated: expose only on a private network)'
    )
  },
  { title: 'Observability' }
)

export type ObservabilityConfig = ValueOf<typeof observabilityConfig>
