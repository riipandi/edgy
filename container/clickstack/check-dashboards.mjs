#!/usr/bin/env node

// Verifies every provisioned dashboard tile against the running ClickStack by
// running the SQL HyperDX would run, and reports which tiles come back empty.
// Catches what a schema check cannot: a tile that parses but whose query is
// wrong, or one pointing at a source that no longer exists.
//
// Usage: node container/clickstack/check-dashboards.mjs [--verbose]

import { execFileSync } from 'node:child_process'

const container = process.env.CLICKSTACK_CONTAINER ?? 'edgy-clickstack-1'
const verbose = process.argv.includes('--verbose')

const mongo = (js) =>
  execFileSync('docker', ['exec', container, 'mongo', '--quiet', 'hyperdx', '--eval', js], {
    encoding: 'utf8'
  })

const clickhouse = (sql) =>
  execFileSync('docker', ['exec', container, 'clickhouse-client', '--query', sql], {
    encoding: 'utf8'
  }).trim()

// Source ids the tiles point at, with the table and time column each one reads.
// `toString()` on an ObjectId here yields `ObjectId("…")`, so the key comes from
// valueOf(). Metric sources have no single table: each metric type gets its own.
const sources = JSON.parse(
  mongo(`
    const out = {};
    db.sources.find({}).forEach(s => {
      out[s._id.valueOf()] = {
        kind: s.kind,
        table: s.from && s.from.tableName,
        timeColumn: s.timestampValueExpression,
        metricTables: s.metricTables
      };
    });
    print(JSON.stringify(out));
  `).trim()
)

const dashboards = JSON.parse(
  mongo(`
    const out = db.dashboards.find({ provisioned: true }, { name: 1, tiles: 1 }).toArray()
      .map(d => ({ name: d.name, tiles: d.tiles }));
    print(JSON.stringify(out));
  `).trim()
)

const TABLE_BY_KIND = { log: 'otel_logs', trace: 'otel_traces', session: 'hyperdx_sessions' }

// Builder series -> aggregate expression. `count` with a condition becomes
// countIf; without one it is a plain count().
const seriesExpression = (series) => {
  if (series.aggFn === 'quantile')
    return `quantile(${series.level ?? 0.95})(${series.valueExpression || '1'})`
  if (series.aggFn === 'count')
    return series.aggCondition ? `countIf(${series.aggCondition})` : 'count()'
  return `${series.aggFn}(${series.valueExpression || '1'})`
}

let total = 0
let empty = 0
let failed = 0

for (const dashboard of dashboards) {
  console.log(`\n${dashboard.name} (${dashboard.tiles.length} tiles)`)
  for (const tile of dashboard.tiles) {
    total += 1
    const config = tile.config
    const label = String(config.name ?? tile.id).padEnd(36)

    const source = sources[config.source]
    if (config.source !== undefined && source === undefined) {
      failed += 1
      console.log(`  FAIL  ${label} source ${config.source} does not exist`)
      continue
    }
    if (source === undefined) {
      failed += 1
      console.log(`  FAIL  ${label} no source set`)
      continue
    }

    // A metric source resolves its table from the series' metricType.
    const metricType = Array.isArray(config.select) ? config.select[0]?.metricType : undefined
    const table =
      source.kind === 'metric'
        ? (source.metricTables?.[metricType ?? 'gauge'] ?? 'otel_metrics_gauge')
        : source.table || TABLE_BY_KIND[source.kind]
    const timeColumn = source.kind === 'metric' ? 'TimeUnix' : (source.timeColumn ?? 'Timestamp')
    const where = config.where ? `(${config.where}) AND ` : ''

    let sql
    try {
      if (config.configType === 'sql') {
        sql = config.sqlTemplate.replaceAll('$__timeInterval(', 'toStartOfMinute(')
      } else if (Array.isArray(config.select) && config.select.length > 0) {
        const expressions = config.select.map(seriesExpression).join(', ')
        const grouped = config.groupBy ? `, ${config.groupBy}` : ''
        const groupByClause = config.groupBy ? ` GROUP BY ${config.groupBy}` : ''
        sql = `SELECT ${expressions}${grouped} FROM default.${table} WHERE ${where}${timeColumn} > now() - INTERVAL 1 HOUR${groupByClause}`
      } else {
        // Search tiles select raw rows.
        sql = `SELECT count() FROM default.${table} WHERE ${where}${timeColumn} > now() - INTERVAL 1 HOUR`
      }
      const rows = clickhouse(sql)
      const count = rows === '' ? 0 : rows.split('\n').length
      if (verbose && rows !== '')
        console.log(
          rows
            .split('\n')
            .slice(0, 3)
            .map((r) => `        ${r}`)
            .join('\n')
        )
      if (count === 0) empty += 1
      console.log(`  ${count === 0 ? 'empty' : 'ok   '} ${label} ${count} row(s)`)
    } catch (error) {
      failed += 1
      const message = String(error.stderr ?? error.message)
        .split('\n')
        .find((line) => line.includes('DB::Exception') || line.includes('Error'))
      console.log(`  FAIL  ${label} ${String(message ?? error.message).slice(0, 110)}`)
    }
  }
}

console.log(
  `\n${total} tiles: ${total - empty - failed} with data, ${empty} empty, ${failed} failed`
)
process.exit(failed === 0 ? 0 : 1)
