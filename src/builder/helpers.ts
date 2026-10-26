import { resolveModuleURL } from 'exsolve'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

export const toRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const method = req.method ?? 'GET'
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item)
    } else headers.append(name, value)
  }
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: 'half'
  } as RequestInit)
}

export const writeResponse = async (
  req: IncomingMessage,
  res: ServerResponse,
  response: Response
) => {
  res.statusCode = response.status
  const cookies = response.headers.getSetCookie()
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return
    res.setHeader(key, value)
  })
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)
  if (req.method === 'HEAD' || response.body === null) {
    res.end()
    return
  }
  await new Promise<void>((resolve, reject) => {
    const body = response.body
    if (body === null) {
      res.end()
      resolve()
      return
    }
    Readable.fromWeb(body as NodeReadableStream).pipe(res)
    res.on('finish', () => resolve())
    res.on('error', reject)
  })
}

// A bare-package import left in the standalone output would fail to resolve
// in the distroless container; the build fails here instead of shipping it.
// Only a statement at a line start or after a `;` counts: the bundles carry
// JSDoc examples and template literals that spell imports inside prose, and
// those are strings, not imports.
export const assertNoExternalImports = (dir: string): void => {
  const offenders: string[] = []
  const visit = (target: string): void => {
    if (statSync(target).isDirectory()) {
      // The native binding copied beside the bundle is a compiled addon, not
      // code this build emitted.
      if (target === path.join(dir, 'node_modules')) return
      for (const name of readdirSync(target)) visit(path.join(target, name))
      return
    }
    if (!target.endsWith('.js')) return
    const code = readFileSync(target, 'utf8')
    const specifiers: string[] = []
    for (const m of code.matchAll(
      /(?:^|;)[ \t]*(?:import|export)(?=[\s{*])[^;'"]{0,400}?from\s*['"]([^'"]+)['"]/gm
    )) {
      if (m[1]) specifiers.push(m[1])
    }
    for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (m[1]) specifiers.push(m[1])
    }
    for (const spec of specifiers) {
      if (/^(?:\.|\/|#|node:|bun:)/.test(spec)) continue
      // A dependency's own CommonJS source can `require('module')` (or `fs`,
      // `path`, ...) without the `node:` prefix; rolldown's CJS interop
      // carries that bare specifier through unchanged.
      if (builtinModules.includes(spec)) continue
      // A bare specifier always starts with a name character; minified string
      // artifacts (embedded keyword tables and the like) rarely do.
      if (!/^[A-Za-z@]/.test(spec)) continue
      offenders.push(`${spec} (${path.relative(dir, target)})`)
    }
  }
  visit(dir)
  if (offenders.length > 0) {
    throw new Error(
      `standalone build leaked external imports:\n  ${[...new Set(offenders)].join('\n  ')}`
    )
  }
}

// A deploy convenience, not a requirement: OxMgr (https://github.com/Vladimir-Urik/OxMgr)
// can run entry.js as a Node `cluster` fan-out across every CPU, transparent
// to the server code (no custom cluster wiring here). Using OxMgr is entirely
// optional — ignore the file and run entry.js directly and nothing changes.
// cluster_mode defaults to off in the generated file so a plain deploy keeps
// today's single-process behavior unless an operator opts in deliberately.
export const writeOxfile = (distDir: string, name: string): void => {
  writeFileSync(
    path.join(distDir, 'oxfile.toml'),
    `#:schema https://raw.githubusercontent.com/Vladimir-Urik/OxMgr/refs/heads/master/schemas/oxfile.schema.json

version = 1

[defaults]
restart_policy = "on_failure"
max_restarts = 10
stop_timeout_secs = 5
health_interval_secs = 20
health_timeout_secs = 4
health_max_failures = 3
stop_signal = "SIGTERM"

[[apps]]
name = "${name}"
command = "node entry.js serve"
health_cmd = "node entry.js healthcheck"

# Set to true to run one worker per CPU (Node \`cluster\`, no code changes
# needed). Before enabling: run migrations once outside cluster_mode, e.g.
# \`node entry.js migrate:up\` — every clustered worker is a separate OS
# process and would otherwise race to migrate the same database.
cluster_instances = 4
cluster_mode = true

[apps.env]
NODE_ENV = "production"
RATE_LIMIT_ENABLED = "false"
SERVER_HOST = "0.0.0.0"
`
  )
}

// Standalone code splitting: one chunk per top-level package. The group
// `name()` skips pnpm's virtual-store segment and derives the package name
// from the module path; exsolve verifies the package resolves so chunk names
// match real dependencies. Modules outside any package stay in the entry.
export const packageNameFor = (moduleId: string): string | null => {
  const match = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?(@[^/]+\/[^/]+|[^@][^/]*)/.exec(
    moduleId
  )
  const name = match?.[1]
  if (name === undefined) return null
  // Flatten scoped packages, so chunks never land in nested subdirectories.
  const flat = name.replace('/', '__')
  return resolveModuleURL(name, { try: true }) === undefined ? null : flat
}
