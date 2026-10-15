import { Schema } from 'effect'

/** Body of `GET /health`: present only when the database answered. */
export const HealthResponseSchema = Schema.Struct({ status: Schema.Literal('ok') })
