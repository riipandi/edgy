import { group, port, text, type ValueOf } from './field.ts'

export const serverConfig = group(
  {
    host: text('HOST', '0.0.0.0', 'Interface the HTTP server binds to'),
    port: port('PORT', 3000, 'Port the HTTP server listens on')
  },
  'Server'
)

export type ServerConfig = ValueOf<typeof serverConfig>
