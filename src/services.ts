import { Layer } from 'effect'
import { UserRepository } from './modules/user/user_repo.ts'
import { UserService } from './modules/user/user_service.ts'

/**
 * Every module's repositories and services. Needs only `DatabaseService` and imports nothing
 * runtime-specific, so the Node and Workers composition roots share it. Each level stays visible
 * (`provideMerge`), so a command can reach a repository directly.
 */
export const ServicesLayer = UserService.layer.pipe(Layer.provideMerge(UserRepository.layer))
