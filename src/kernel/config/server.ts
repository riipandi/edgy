import { group, port, text } from './field.ts'

export const serverConfig = group(
  {
    host: text('SERVER_HOST', '0.0.0.0', 'Interface the HTTP server binds to'),
    port: port('SERVER_PORT', 3000, 'Port the HTTP server listens on')
  },
  'Server'
)
