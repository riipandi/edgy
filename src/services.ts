import { Layer } from 'effect'
import { UserRepository } from './modules/user/user_repo.ts'
import { UserService } from './modules/user/user_service.ts'

/**
 * Every module's repositories and services, wired together. It needs a
 * `DatabaseService` and nothing else, and imports nothing runtime-specific, so
 * both composition roots share it: Node (`layers.ts`) and Workers (`worker.ts`).
 *
 * Each level stays visible in the output (`provideMerge`), so a command that
 * only needs a repository can still reach it. A new module adds its layers here.
 */
export const ServicesLayer = UserService.layer.pipe(Layer.provideMerge(UserRepository.layer))
