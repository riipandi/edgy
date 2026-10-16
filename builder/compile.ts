#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inject } from 'postject'
import { createBuilder } from 'vite'

/**
 * `pnpm compile`: one executable with the application and its browser assets inside. It is a
 * script because Vite does not make executables; the packaging uses Node's experimental SEA.
 *
 * SEA embeds one CommonJS file, so the server is built again as `cjs` with no code splitting and
 * no shebang. The blob is injected with `postject` into a copy of the running `node` binary. On
 * macOS the signature is removed first and re-applied ad hoc, since macOS rejects a modified binary
 * with a stale signature.
 *
 * The output embeds the Node runtime (about 120 MB) and runs only on the platform that built it.
 * SEA is supported on Windows, macOS arm64 and Linux except Alpine and s390x.
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
    // Unsigned binaries and machines without codesign are expected.
  }
}

const build = async (outDir: string): Promise<void> => {
  const builder = await createBuilder({
    root: rootDir,
    configFile: path.join(rootDir, 'vite.config.ts'),
    mode: 'production',
    build: { emptyOutDir: true },
    environments: {
      client: { build: { outDir, emptyOutDir: false } },
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
            // CommonJS has no `import.meta`. Its one reader runs only outside the executable.
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

    const assetsDir = path.join(server, 'assets')
    const blob = path.join(temp, 'sea-prep.blob')
    const seaConfig = path.join(temp, 'sea-config.json')
    writeFileSync(
      seaConfig,
      JSON.stringify({
        main: path.join(server, 'main.cjs'),
        output: blob,
        disableExperimentalSEAWarning: true,
        // Browser assets, keyed `assets/<name>` as the SEA runtime reads them.
        assets: Object.fromEntries(
          walk(assetsDir).map((file) => [
            `assets/${path.relative(assetsDir, file).split(path.sep).join('/')}`,
            file
          ])
        )
      })
    )
    execFileSync(process.execPath, ['--experimental-sea-config', seaConfig])

    mkdirSync(path.join(rootDir, DIST_DIR), { recursive: true })
    const output = path.join(rootDir, DIST_DIR, outputName)
    // Built beside the result and renamed last, so a failure never leaves a plain Node binary
    // under the executable's name.
    const partial = `${output}.partial`
    try {
      copyFileSync(process.execPath, partial)
      chmodSync(partial, 0o755)

      const mac = process.platform === 'darwin'
      if (mac) codesign(['--remove-signature', partial])
      await inject(partial, 'NODE_SEA_BLOB', readFileSync(blob), {
        sentinelFuse: NODE_SEA_FUSE,
        ...(mac ? { machoSegmentName: 'NODE_SEA' } : {})
      })
      if (mac) codesign(['--sign', '-', partial])
      renameSync(partial, output)
    } catch (error) {
      rmSync(partial, { force: true })
      throw error
    }
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
