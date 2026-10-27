import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { usersQueryOptions } from '#/modules/identity/user/user_queries.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as userStyles } from '#/resources/styles/pages/user.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

export const Route = createFileRoute('/(app)/users/')({
  head: () => ({ meta: [{ title: 'Users - Edgy' }] }),
  loader: ({ context }) =>
    context.queryClient.query({ ...usersQueryOptions, staleTime: 'static' }).catch((cause) => {
      // Start serializes a loader error onto the error page; log the real
      // cause server-side and rethrow a message safe to render.
      console.error('users list loader failed', cause)
      throw new Error('This page could not be loaded.')
    }),
  component: UsersPage
})

function UsersPage() {
  const { data: users } = useSuspenseQuery(usersQueryOptions)
  return (
    <section {...sx(userStyles.card)}>
      <ul {...sx(userStyles.list)}>
        {users.map((user) => (
          <li key={user.id}>
            <Link
              {...sx(userStyles.listLink, fx.focusable)}
              params={{ id: user.id }}
              to='/users/$id'
            >
              {user.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
