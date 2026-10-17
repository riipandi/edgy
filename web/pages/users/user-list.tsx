import { For, createMemo, createSignal } from 'solid-js'
import { inputStyle } from '../../styles/components/input.css.ts'
import { email, list, muted, name, row } from '../../styles/pages/user.css.ts'

export interface UserListUser {
  readonly id: string
  readonly email: string
  readonly name: string
}

/**
 * The user directory: a filter box narrows the list in the browser. The list it shows arrives
 * through props today and through `/rpc` in phase 4 of plan-20261018_0105; the filtering stays
 * here either way.
 */
export const UserList = (props: { users: readonly UserListUser[] }) => {
  const [query, setQuery] = createSignal('')

  const shown = createMemo(() => {
    const needle = query().trim().toLowerCase()
    return props.users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(needle))
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
        Showing {shown().length} of {props.users.length}
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
