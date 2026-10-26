// Ambient declarations for the type-aware linter (tsgolint),
// which resolves tsconfig `types` per-file and misses the
// `*.css` module from `vite-plus/client` that covers
// side-effect CSS imports.
declare module '*.css'
