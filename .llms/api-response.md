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
    data?: {} | [] // Always present on success
    metadata: {
        status_code: number (http code)
        request_id: string
        trace_id?: string

        // Rate limit information
        rate_limit?: ApiRateLimit

        // How a cached read was answered: hit | miss | bypass (absent when nothing was cached)
        cache?: 'hit' | 'miss' | 'bypass'

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
    limit?: number // number of items per page
    has_more?: boolean // whether a page follows
    next_cursor?: string | null // opaque; pass it as `cursor`; null on the last page
}
```

PaginationParams (query params):

```json
{
    limit?: number // number of items per page (1 to 100)
    cursor?: string // opaque, from `next_cursor` / `links.next`; bound to the sort it was issued for
    sort_by?: string // sort by column or field name
    sort_order?: 'asc' | 'desc' // sort direction
}
```

Links of a collection: `self`, `first` (no cursor), `next` (`null` on the last page).

Error response (only under `/api`; any other path answers an HTML error page with the same status and headers, see `rules.md`):

```json
{
    status: error
    message: string (general error message) // Always present
    error: ApiErrorBody
    metadata: {
        status_code: number (http code)
        request_id: string
        trace_id?: string // trc_… when the trace was recorded, errors included
        rate_limit?: ApiRateLimit // also on a 429 and on any error under the rate limiter
        cache?: 'hit' | 'miss' | 'bypass' // also on an error, when a cached read preceded it
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
