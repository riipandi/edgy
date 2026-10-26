#!/usr/bin/env node
// Prints the docker image reference for this package, so npm scripts work
// under any runner (pnpm, vp run) without relying on npm_package_* env vars.
// Usage:
//   node scripts/docker-ref.mjs            -> "<image>:<version>"
//   node scripts/docker-ref.mjs -dev       -> "<image>:<version>-dev"
//   node scripts/docker-ref.mjs --image    -> "<image>"
//   node scripts/docker-ref.mjs --name     -> "<package name>"

import { readFile } from 'node:fs/promises'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const arg = process.argv[2] ?? ''
const image = pkg.config?.image ?? pkg.name

if (arg === '--image') {
  process.stdout.write(image)
} else if (arg === '--name') {
  process.stdout.write(pkg.name)
} else {
  process.stdout.write(`${image}:${pkg.version}${arg}`)
}
