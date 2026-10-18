import { For, createMemo, createSignal } from 'solid-js'
import { listUsers } from '../rpc/client.ts'
import { inputStyle } from '../styles/components/input.css.ts'
import { email, list, muted, name, row } from '../styles/pages/user.css.ts'

export interface UserListUser {
  readonly id: string
  readonly email: string
  readonly name: string
}

/**
 * The user directory: the list loads from `/rpc` (`listUsers`), and a filter box narrows it in
 * the browser. The first read starts when the component mounts.
 */
export const UserList = () => {
  const [query, setQuery] = createSignal('')
  const [users, setUsers] = createSignal<readonly UserListUser[]>([])
  const [failed, setFailed] = createSignal<string | undefined>(undefined)

  void listUsers({}).then(
    (page) => setUsers(page.users),
    (error: unknown) =>
      setFailed(error instanceof Error ? error.message : 'The list could not be loaded')
  )

  const shown = createMemo(() => {
    const needle = query().trim().toLowerCase()
    return users().filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(needle))
  })

  return (
    <>
      <input
        type='search'
        class={inputStyle}
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
        placeholder='Filter users'
        aria-label='Filter users'
      />
      <p class={muted}>
        {failed() !== undefined ? failed() : `Showing ${shown().length} of ${users().length}`}
      </p>
      <ul class={list}>
        <For each={shown()}>
          {(user) => (
            <li class={row}>
              <span class={name}>{user.name}</span>
              <span class={email}>{user.email}</span>
            </li>
          )}
        </For>
      </ul>
    </>
  )
}
