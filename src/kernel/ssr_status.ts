import { createIsomorphicFn } from '@tanstack/react-start'
import { setResponseStatus } from '@tanstack/react-start/server'

// Wrapping the call inside this boundary is what lets the compiler treat the
// server import as safe to strip from the client bundle.
export const setStatus = createIsomorphicFn().server((status: number) => setResponseStatus(status))
