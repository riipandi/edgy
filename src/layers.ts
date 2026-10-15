import { Layer } from 'effect'
import { DatabaseLayer } from './database/layer.ts'
import { ServicesLayer } from './services.ts'

/**
 * Data-access stack for Node.js: the configured database driver, then every
 * module's services on top. Built once per command (`Command.provide`), while
 * `CoreLayer` is provided once at the entry point. The Workers entry composes
 * `ServicesLayer` with D1 itself, so none of the Node-only pieces reach it.
 */
export const AppLayer = ServicesLayer.pipe(Layer.provideMerge(DatabaseLayer))
