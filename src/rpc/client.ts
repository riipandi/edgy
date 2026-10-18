import type { User } from '../modules/user/user_schema.ts'

/**
 * The browser client for `/rpc` (plan-20261018_0105, D3): a thin ndjson reader over fetch. The
 * wire contract is `effect/rpc`'s: requests are `{ _tag: "Request", id, tag, payload, headers }`
 * lines; the answer's terminal line carries the `Exit` — a success value or a failure cause —
 * so a procedure's typed error arrives as data, not as an HTTP status.
 */
interface RpcFailure {
  readonly code: string
  readonly message: string
}

export class RpcClientError extends Error {
  readonly code: string
  constructor(failure: RpcFailure) {
    super(failure.message)
    this.name = 'RpcClientError'
    this.code = failure.code
  }
}

let nextRequestId = 0

/** One request/response exchange over the ndjson transport. */
export const callRpc = async <Success>(tag: string, payload: unknown): Promise<Success> => {
  const id = nextRequestId++
  const response = await fetch('/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/ndjson' },
    body: `${JSON.stringify({
      _tag: 'Request',
      id,
      tag,
      payload,
      headers: []
    })}\n`
  })
  if (!response.ok)
    throw new RpcClientError({
      code: 'RPC_TRANSPORT',
      message: `rpc transport failed with ${response.status}`
    })

  const text = await response.text()
  let success: Success | undefined
  let failure: RpcFailure | undefined
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    // The wire is our own server's ndjson; the shapes above are its contract.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const message = JSON.parse(line) as
      | { _tag: 'Chunk'; requestId: number; values: readonly Success[] }
      | {
          _tag: 'Exit'
          requestId: number
          exit:
            | { _tag: 'Success'; value: Success }
            | { _tag: 'Failure'; cause: readonly { _tag: 'Fail'; error: RpcFailure }[] }
        }
    if (message._tag === 'Exit' && message.requestId === id) {
      if (message.exit._tag === 'Success') success = message.exit.value
      else {
        const fail = message.exit.cause.find((entry) => entry._tag === 'Fail')
        if (fail !== undefined && 'error' in fail) failure = fail.error
      }
    }
  }
  if (failure !== undefined) throw new RpcClientError(failure)
  if (success === undefined) {
    throw new RpcClientError({ code: 'RPC_NO_ANSWER', message: 'rpc answer carried no exit' })
  }
  return success
}

/** The pages' reads, typed by the group's schemas (`src/modules/user/user_rpc.ts`). */
export const listUsers = (payload: { readonly limit?: number | undefined }) =>
  callRpc<{ users: readonly User[] }>('userList', payload)
