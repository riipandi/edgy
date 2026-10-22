import { Schema } from 'effect'
import * as HttpApiEndpoint from 'effect/http-api/HttpApiEndpoint'
import * as HttpApiError from 'effect/http-api/HttpApiError'
import * as HttpApiGroup from 'effect/http-api/HttpApiGroup'

export class HealthApi extends HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('health', '/health', {
    success: Schema.Struct({ status: Schema.Literal('ok') }),
    error: HttpApiError.ServiceUnavailable
  })
) {}
