import { Title } from '@solidjs/meta'
import { For, createMemo } from 'solid-js'
import { listUsers } from '#/modules/identity/user/user_fn.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as userStyles } from '#/resources/styles/pages/user.stylex.ts'
import { sx } from '#/resources/styles/props.ts'
import { paths } from '#/router.ts'

// The layout's index page: what /users itself renders inside users.tsx.
// Without an index, /users would fall through to the [...404] catch-all.
export default function RouteComponent() {
  const users = createMemo(() => listUsers())
  return (
    <section {...sx(userStyles.card)}>
      <Title>Users - Edgy</Title>
      <ul {...sx(userStyles.list)}>
        <For each={users()}>
          {(user) => (
            <li>
              <a {...sx(userStyles.listLink, fx.focusable)} href={paths.users(user.id)}>
                {user.name}
              </a>
            </li>
          )}
        </For>
      </ul>
    </section>
  )
}
