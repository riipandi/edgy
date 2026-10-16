import { cleanup } from '@marko/testing-library'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// The library registers its own cleanup only when `afterEach` is a global, and Vitest's is not.
afterEach(cleanup)
