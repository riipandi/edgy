import { cleanup } from '@solidjs/testing-library'
import { afterEach } from 'vitest'

// The library registers cleanup itself only when `afterEach` is a global; Vitest's does not
// expose one, so the renderer is torn down here between tests.
afterEach(() => cleanup())
