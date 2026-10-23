#!/usr/bin/env node
// Renders every provisioned dashboard tile through HyperDX's own
// `renderChartConfig` and runs the SQL it produces. This is the path the UI
// takes, so a tile that passes here renders in the browser — a hand-written SQL
// check cannot prove that, and it is exactly how the missing `connection` id and
// the name-instead-of-id `source` slipped through.
//
// Runs inside the ClickStack container, where @hyperdx/common-utils lives.
//
// Usage: docker exec edgy-clickstack-1 node /clickstack/render-tiles.mjs
import { execFileSync } from 'node:child_process'

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL ?? 'http://localhost:8123'
const MODULES = '/app/packages/common-utils/dist'

const mongo = (js) =>
  execFileSync('mongo', ['--quiet', 'hyperdx', '--eval', js], { encoding: 'utf8' }).trim()

// JSON.stringify renders an ObjectId as {$oid}, not a bare string.
const idOf = (value) => (typeof value === 'object' && value !== null ? value.$oid : value)

const { ClickhouseClient } = await import(`${MODULES}/clickhouse/node.js`)
const { Metadata, MetadataCache, tcFromSource } = await import(`${MODULES}/core/metadata.js`)
const { renderChartConfig } = await import(`${MODULES}/core/renderChartConfig.js`)
const { buildSearchChartConfig } = await import(`${MODULES}/core/searchChartConfig.js`)

const sources = JSON.parse(
  mongo(`
    const out = [];
    db.sources.find({}).forEach(s => out.push(s));
    print(JSON.stringify(out));
  `)
)
const byId = new Map(sources.map((s) => [idOf(s._id), s]))

const dashboards = JSON.parse(
  mongo(`
    const out = db.dashboards.find({ provisioned: true }, { name: 1, tiles: 1 }).toArray()
      .map(d => ({ name: d.name, tiles: d.tiles }));
    print(JSON.stringify(out));
  `)
)

const client = new ClickhouseClient({ host: CLICKHOUSE_URL })
const metadata = new Metadata(client, new MetadataCache())

const now = Date.now()
const dateRange = [new Date(now - 3600_000), new Date(now)]

let total = 0
let empty = 0
let failed = 0

for (const dashboard of dashboards) {
  console.log(`\n${dashboard.name}`)
  for (const tile of dashboard.tiles) {
    total += 1
    const config = tile.config
    const label = String(config.name ?? tile.id).padEnd(36)
    const source = byId.get(idOf(config.source))
    if (!source) {
      failed += 1
      console.log(`  FAIL  ${label} source ${config.source} not found`)
      continue
    }
    try {
      // A builder tile stores the source id, not the table: the from and
      // timestamp expressions come from the source it points at. A metric
      // source has an empty tableName and one table per metric type instead.
      const table = tcFromSource(source)
      const metricType = Array.isArray(config.select) ? config.select[0]?.metricType : undefined
      const tableName =
        source.kind === 'metric'
          ? (source.metricTables?.[metricType ?? 'gauge'] ?? 'otel_metrics_gauge')
          : table.tableName
      const chartConfig =
        config.displayType === 'search'
          ? buildSearchChartConfig(source, {
              where: config.where,
              whereLanguage: config.whereLanguage,
              select: config.select,
              dateRange
            })
          : {
              ...config,
              dateRange,
              from: { databaseName: table.databaseName || 'default', tableName },
              // The UI injects the source's metric table map; without it the
              // MetricName filter is never emitted and the query sums every
              // metric in the table.
              ...(source.kind === 'metric' ? { metricTables: source.metricTables } : {}),
              timestampValueExpression: table.timestampValueExpression,
              connection: config.connection ?? idOf(table.connectionId)
            }
      const rendered = await renderChartConfig(chartConfig, metadata, new Map())
      // renderChartConfig returns { sql, params }: the date range travels as
      // ClickHouse query parameters, so they must be forwarded with the query.
      const result = await client.query({
        query: rendered.sql,
        query_params: rendered.params,
        format: 'JSONEachRow'
      })
      const rows = await result.json()
      if (rows.length === 0) empty += 1
      console.log(`  ${rows.length === 0 ? 'empty' : 'ok   '} ${label} ${rows.length} row(s)`)
    } catch (error) {
      failed += 1
      console.log(`  FAIL  ${label} ${String(error.message).split('\n')[0].slice(0, 130)}`)
    }
  }
}

console.log(
  `\n${total} tiles: ${total - empty - failed} with data, ${empty} empty, ${failed} failed`
)
process.exit(failed === 0 ? 0 : 1)
