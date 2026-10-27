import { createFileRoute } from '@tanstack/react-router'
import { listUsers } from '#/modules/identity/user/user_fns.ts'
import { paths } from '#/paths.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as userStyles } from '#/resources/styles/pages/user.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

export const Route = createFileRoute('/_app/users/')({
  head: () => ({ meta: [{ title: 'Users - Edgy' }] }),
  loader: () => listUsers(),
  component: UsersPage
})

function UsersPage() {
  const users = Route.useLoaderData()
  return (
    <section {...sx(userStyles.card)}>
      <ul {...sx(userStyles.list)}>
        {users.map((user) => (
          <li key={user.id}>
            <a {...sx(userStyles.listLink, fx.focusable)} href={paths.users(user.id)}>
              {user.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
