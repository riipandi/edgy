import { Command } from 'effect/cli'
import { migrateStatus } from './migrate-status.ts'
import { migrateUp } from './migrate-up.ts'
import { serve } from './serve.ts'

export const cli = Command.run(
  Command.make('app').pipe(
    Command.withDescription('Application commands'),
    Command.withSubcommands([serve, migrateUp, migrateStatus])
  ),
  { version: '0.0.0' }
)
