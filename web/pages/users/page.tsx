import { Show } from 'solid-js'
import { pagerLink } from '../../styles/components/link.css.ts'
import { intro, pager } from '../../styles/pages/user.css.ts'
import { AppShell } from '../app-shell.tsx'
import { UserList, type UserListUser } from './user-list.tsx'

/** What the users page shows: the directory plus its pager links. */
export interface UsersPageInput {
  readonly users: readonly UserListUser[]
  readonly first: string | null
  readonly next: string | null
  /** The page's built browser entries, resolved by the handler from the build manifest. */
  readonly scripts: readonly string[]
}

/**
 * `GET /users`: the user directory. Interactive — it hydrates from `./client.tsx`, which reads
 * the input island this component emits beside its root.
 */
export function UsersPage(input: UsersPageInput) {
  return (
    <AppShell title='Users' scripts={input.scripts}>
      <div id='users-page-root'>
        <h1 class={intro}>Users</h1>
        <UserList users={input.users} />
        <Show when={input.first !== null || input.next !== null}>
          <nav class={pager} aria-label='Pages'>
            <Show when={input.first !== null}>
              <a class={pagerLink} href={input.first!} rel='first'>
                Back to the start
              </a>
            </Show>
            <Show when={input.next !== null}>
              <a class={pagerLink} href={input.next!} rel='next'>
                Next
              </a>
            </Show>
          </nav>
        </Show>
        <script
          type='application/json'
          id='users-page-data'
          innerHTML={JSON.stringify(input).replace(/</g, '\\u003c')}
        />
      </div>
    </AppShell>
  )
}

export default UsersPage
