/**
 * Ambient types for the part of `postject` the builder uses. The package ships no types, and
 * `strict` rejects an implicit `any`.
 */
declare module 'postject' {
  /** Options for {@link inject}. */
  export interface InjectOptions {
    /** Mach-O segment that receives the resource. Default `__POSTJECT`. */
    readonly machoSegmentName?: string
    /** Allow overwriting an existing resource of the same name. */
    readonly overwrite?: boolean
    /**
     * Sentinel fuse; its last character is flipped to mark the binary as injected.
     * The default is postject's own fuse, which Node.js ignores.
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
