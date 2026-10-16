/**
 * The part of `import.meta.env` this code reads. Vite replaces `DEV` with `false` in builds, so the
 * branch it guards is removed from deployed code.
 */

interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
