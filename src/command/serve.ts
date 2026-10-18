import { Layer } from 'effect'
import { Command } from 'effect/cli'
import { server } from '../kernel/http/serve.ts'

export const serve = Command.make('serve').pipe(
  Command.withDescription('Serve the production build'),
  Command.withHandler(() => Layer.launch(server))
)
