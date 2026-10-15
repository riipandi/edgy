import { appendFileSync } from 'node:fs'

// A stand-in for the development server: notes each start in a file, then stays alive until it is
// told to stop (SIGTERM ends the process, as the real one's graceful shutdown does).
const note = process.env['DEV_CHILD_LOG']
if (note !== undefined) appendFileSync(note, `start ${process.argv.slice(2).join(' ')}\n`)
if (process.argv.includes('--exit')) process.exit(0)
if (process.argv.includes('--fail')) process.exit(3)
setInterval(() => undefined, 1000)
