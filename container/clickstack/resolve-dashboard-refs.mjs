#!/usr/bin/env node
// Rewrites a dashboard directory so every `source` and `connection` reference is
// the ObjectId HyperDX stores, resolved from the name written in the file.
//
// HyperDX compares those fields against `_id` and reports "The data source for
// this tile no longer exists" / "Error loading chart" when it finds a name.
// Names are what the files carry because the ids are regenerated whenever the
// stack is recreated from scratch; resolving here keeps the JSON portable.
//
// Runs inside the ClickStack container, where the `mongo` shell is available.
//
// Usage: node resolve-dashboard-refs.mjs --src <dir> --out <dir>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const source = arg('--src', '/dashboards')
const out = arg('--out', '/tmp/dashboards')

const mongo = (js) =>
  execFileSync('mongo', ['--quiet', 'hyperdx', '--eval', js], { encoding: 'utf8' }).trim()

const byName = (collection) =>
  JSON.parse(
    mongo(`
      const out = {};
      db.${collection}.find({}).forEach(d => { out[d.name] = d._id.valueOf(); });
      print(JSON.stringify(out));
    `)
  )

const sources = byName('sources')
const connections = byName('connections')

const resolve = (value, table, field) => {
  if (typeof value !== 'string' || value === '') return value
  // Already an ObjectId (24 hex chars): leave it alone.
  if (/^[0-9a-f]{24}$/i.test(value)) return value
  const id = table[value]
  if (id === undefined) throw new Error(`Unknown ${field} "${value}"`)
  return id
}

mkdirSync(out, { recursive: true })

for (const file of readdirSync(source).filter((f) => f.endsWith('.json'))) {
  const dashboard = JSON.parse(readFileSync(join(source, file), 'utf8'))
  for (const tile of dashboard.tiles ?? []) {
    const config = tile.config ?? {}
    config.source = resolve(config.source, sources, 'source')
    config.connection = resolve(config.connection, connections, 'connection')
  }
  writeFileSync(join(out, file), `${JSON.stringify(dashboard, null, 2)}\n`)
  console.log(`resolved ${file}`)
}
