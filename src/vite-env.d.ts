/**
 * The part of `import.meta.env` this code reads. Vite defines it in every
 * module it builds or serves, and replaces it with a constant in a build,
 * so `import.meta.env.DEV` is `false` (and the branch it guards is gone)
 * in anything deployed.
 */

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
