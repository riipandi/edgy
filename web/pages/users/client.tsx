// The `/users` page's browser entry (plan-20261018_0105, D7): it claims the markup the server
// rendered and attaches the list's reactivity. The entry name is registered in `builder/edgy.ts`.
import { hydrate } from '@solidjs/web'
import { createComponent } from 'solid-js'
import { UsersPage, type UsersPageInput } from './page.tsx'

const root = document.getElementById('users-page-root')
if (root === null) throw new Error('/users is missing its hydration root')

// The server serialized the page's input beside the root, so hydration starts from the same
// data the markup shows (phase 4 of the plan replaces this island with the `/rpc` client).
const island = document.getElementById('users-page-data')
if (island === null) throw new Error('/users is missing its data island')

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the island is our own JSON, emitted by the page
const input = JSON.parse(island.textContent ?? '{}') as UsersPageInput

hydrate(() => createComponent(UsersPage, input), root)
