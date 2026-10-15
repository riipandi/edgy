import { NodeServices } from '@effect/platform-node'
import { Layer } from 'effect'
import { DatabaseService } from '../database/service.ts'
import { LoggerLayer } from '../observer/logger.ts'
import { UserRepository } from '../repository/user_repo.ts'
import { UserService } from '../service/user_service.ts'
import { ConfigLayer } from './config/service.ts'

/**
 * Process-wide services, provided once at the entry point (`main.ts`):
 * configuration, the non-blocking logger and the Node platform services
 * (`FileSystem`, `Path`, `Terminal`, …) the CLI needs.
 *
 * The logger reads configuration, so `provideMerge` builds `ConfigLayer` once
 * and keeps `ConfigService` in the output for everything downstream.
 */
export const CoreLayer = Layer.mergeAll(NodeServices.layer, LoggerLayer).pipe(
  Layer.provideMerge(ConfigLayer)
)

/**
 * Data-access stack: database → repositories → services. Each layer is
 * `provideMerge`d, so every level stays visible to commands (a migration only
 * needs `DatabaseService`) while the stack is built once per command.
 */
export const AppLayer = UserService.layer.pipe(
  Layer.provideMerge(UserRepository.layer),
  Layer.provideMerge(DatabaseService.layer)
)
