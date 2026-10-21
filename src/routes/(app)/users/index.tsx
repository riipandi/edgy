import { Title } from '@solidjs/meta'
import { For, createMemo } from 'solid-js'
import { listUsers } from '../../../modules/user/user_fn'
import { fx } from '../../../resources/styles/core/utils.stylex'
import { styles as userStyles } from '../../../resources/styles/pages/user.stylex'
import { sx } from '../../../resources/styles/props'
import { paths } from '../../../router'

// The layout's index page: what /users itself renders inside users.tsx.
// Without an index, /users would fall through to the [...404] catch-all.
export default function RouteComponent() {
  const users = createMemo(() => listUsers())
  return (
    <section {...sx(userStyles.card)}>
      <Title>Users - Solid App</Title>
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
