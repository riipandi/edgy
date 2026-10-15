#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inject } from 'postject'
import { createBuilder } from 'vite'

/**
 * `pnpm compile`: a single executable (Node's Single Executable Applications, **experimental**) with
 * the application and its browser assets inside, so it serves its own pages with nothing beside it.
 * It is the one build step that is a script of its own, because Vite does not make executables.
 *
 * Node's SEA runs one embedded CommonJS file, so the application is built again for it (the Node
 * configuration, overridden: `cjs`, no code splitting, no shebang). Then, as in Node's guide:
 * `node --experimental-sea-config` makes a blob, the running `node` binary is copied, and
 * `postject` injects the blob and flips the fuse; on macOS the signature is removed first and the
 * binary is signed ad hoc afterwards, since macOS refuses a modified binary whose signature no
 * longer matches.
 *
 * The result embeds the Node runtime (about 120 MB) and only runs on the platform that built it.
 * Node supports SEA on Windows, macOS arm64 and Linux except Alpine and s390x. `--minify` minifies
 * the server code.
 */
const rootDir = process.cwd()
const DIST_DIR = 'dist'
const outputName = process.platform === 'win32' ? 'edgy.exe' : 'edgy'

/** The fuse Node.js looks for; `postject` flips its last character. */
const NODE_SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  )

/** Runs `codesign`, ignoring a binary that was never signed or a machine that has no `codesign`. */
const codesign = (args: readonly string[]): void => {
  try {
    execFileSync('codesign', args, { stdio: 'ignore' })
  } catch {
    // Safe to continue.
  }
}

const build = async (outDir: string): Promise<void> => {
  const builder = await createBuilder({
    root: rootDir,
    configFile: path.join(rootDir, 'vite.config.ts'),
    mode: 'production',
    build: { emptyOutDir: true },
    environments: {
      client: { build: { outDir: path.join(outDir, 'public') } },
      ssr: {
        build: {
          outDir,
          sourcemap: false,
          ...(process.argv.includes('--minify') ? { minify: 'oxc' as const } : {}),
          rolldownOptions: {
            output: {
              format: 'cjs',
              entryFileNames: 'main.cjs',
              codeSplitting: false,
              banner: () => ''
            },
            // `import.meta` is what a CommonJS bundle does not have; the one place that reads it
            // (`server.ts`) is reached only when the process is not an executable.
            transform: { define: { 'import.meta': '({})' } }
          }
        }
      }
    }
  })
  await builder.buildApp()
}

const compile = async (): Promise<string> => {
  const temp = mkdtempSync(path.join(tmpdir(), 'edgy-sea-'))
  const server = path.join(temp, 'server')
  try {
    await build(server)

    const publicDir = path.join(server, 'public')
    const blob = path.join(temp, 'sea-prep.blob')
    const seaConfig = path.join(temp, 'sea-config.json')
    writeFileSync(
      seaConfig,
      JSON.stringify({
        main: path.join(server, 'main.cjs'),
        output: blob,
        disableExperimentalSEAWarning: true,
        // The browser assets, keyed `public/<path>`, which is what `embeddedAssets` reads.
        assets: Object.fromEntries(
          walk(publicDir).map((file) => [
            `public/${path.relative(publicDir, file).split(path.sep).join('/')}`,
            file
          ])
        )
      })
    )
    execFileSync(process.execPath, ['--experimental-sea-config', seaConfig])

    mkdirSync(path.join(rootDir, DIST_DIR), { recursive: true })
    const output = path.join(rootDir, DIST_DIR, outputName)
    copyFileSync(process.execPath, output)
    chmodSync(output, 0o755)

    const mac = process.platform === 'darwin'
    if (mac) codesign(['--remove-signature', output])
    await inject(output, 'NODE_SEA_BLOB', readFileSync(blob), {
      sentinelFuse: NODE_SEA_FUSE,
      ...(mac ? { machoSegmentName: 'NODE_SEA' } : {})
    })
    if (mac) codesign(['--sign', '-', output])
    return output
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

const started = Date.now()
compile().then(
  (output) => {
    const relative = path.relative(rootDir, output)
    const megabytes = (statSync(output).size / 1024 / 1024).toFixed(1)
    process.stdout.write(
      `Executable built in ${Date.now() - started}ms (experimental, ${process.platform}-${process.arch})\n` +
        `  ${relative} (${megabytes} MB)\nRun:  ./${relative} serve\n`
    )
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  }
)
