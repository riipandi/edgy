# API Response Specification

Minimal sucess response:

```json
{
    status: success
    message?: string
    metadata: {
        status_code: number (http code)
        request_id: string
    }
}
```

Complete success response:
```json
{
    status: success
    message?: string
    data?: {} | []
    metadata: {
        status_code: number (http code)
        request_id: string
        trace_id?: string

        // Rate limit information
        rate_limit?: ApiRateLimit

        // Pagination information (HATEOAS-first)
        ...ApiPagination
    }

    // Simple HATEOAS-friendly link map.
    // Keys are link relations (e.g. "self", "next", "prev", "related") and values are URLs or null.
    links? Record<string, string | null> | null
}
```

ApiPagination:
```json
{
    page?: number | null // current page number
    limit?: number | null // number of items per page

    // Totals (optional when unknown or not applicable)
    total_pages?: number | null
    total_items?: number | null

    // Inclusive item range in the current page (optional)
    first_item_index?: number | null
    last_item_index?: number | null
}
```

PaginationParams (query params):
```json
{
    page?: number // number of the page to retrieve, set -1 for all records
    limit?: number // number of items per page, set -1 for all records
    sort_by?: string // sort by column or field name
    sort_order?: 'asc' | 'desc' // sort direction
}
```

Error response:
```json
{
    status: error
    message: string (general error message)
    error: ApiErrorBody
    metadata: {
        status_code: number (http code)
        request_id: string
        trace_id?: string // trc_… when the trace was recorded, errors included
        rate_limit?: ApiRateLimit // also on a 429 and on any error under the rate limiter
    }
}
```

ApiErrorBody:
```json
{
    code: string // stable identifier: NOT_FOUND, VALIDATION_FAILED, CONFLICT, RATE_LIMITED, DATABASE_ERROR, ...
    retryable: boolean // the same request may succeed if sent again
    details?: {} | [] // per-error facts: validation issues, { id }, { retry_after }
    debug?: { type: string, message?: string } // only at LOG_LEVEL=Debug or below; redacted
}
```

Links:
```json
{
    links?: {
        self?: string | null
        next?: string | null
        prev?: string | null
        first?: string | null
        last?: string | null
        [rel: string]: string | null | undefined
    } | null
}
```

ApiRateLimit:
```json
{
    limit: number // maximum number of requests allowed in the current window
    remaining?: number // requests left in the current window; absent when the store cannot tell (Cloudflare binding)
    reset: number // unix timestamp when the limit resets
}
```
