/**
 * Minimal ambient types for `postject`.
 *
 * The package ships no type declarations (`main: dist/api.js`, no `types`
 * field), so TypeScript would treat it as `any` and fail under `strict`. Only
 * the surface the builder uses is declared here; extend it if more is needed.
 */
declare module 'postject' {
  /** Options accepted by {@link inject}. */
  export interface InjectOptions {
    /** Mach-O segment that receives the resource. Default `__POSTJECT`. */
    readonly machoSegmentName?: string
    /** Allow overwriting an existing resource of the same name. */
    readonly overwrite?: boolean
    /**
     * Sentinel fuse whose last character is flipped to mark the binary as
     * injected. Defaults to postject's own fuse, which Node.js ignores.
     */
    readonly sentinelFuse?: string
  }

  /**
   * Injects `resourceData` into `filename` under `resourceName`.
   *
   * On a PE binary it becomes a resource, on Mach-O a section, on ELF a note.
   */
  export function inject(
    filename: string,
    resourceName: string,
    resourceData: Buffer,
    options?: InjectOptions
  ): Promise<void>
}
