import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { setStatus } from '#/kernel/ssr_status.ts'
import { userQueryOptions } from '#/modules/identity/user/user_queries.ts'
import type { UserResult } from '#/modules/identity/user/user_schema.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as userStyles } from '#/resources/styles/pages/user.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

function userTitle(user: UserResult | null | undefined, id: string): string {
  return user == null ? 'User not found' : `User ${id} - Edgy`
}

function UserPage() {
  const params = Route.useParams()
  const { data: user } = useSuspenseQuery(userQueryOptions(params.id))
  return (
    <section {...sx(userStyles.card, userStyles.detailSection)}>
      {user === null ? (
        <>
          <h2 {...sx(fx.h2, userStyles.detailTitle)}>User not found</h2>
          <p {...sx(fx.muted)}>The requested user does not exist.</p>
        </>
      ) : (
        <>
          <h2 {...sx(fx.h2, userStyles.detailTitle)}>{user.name}</h2>
          <p {...sx(fx.muted)}>{user.email}</p>
        </>
      )}
      <Link {...sx(fx.link, fx.focusable, userStyles.detailBack)} to='/users'>
        All users
      </Link>
    </section>
  )
}

export const Route = createFileRoute('/(app)/users/$id')({
  loader: ({ context, params }) =>
    context.queryClient
      .query({ ...userQueryOptions(params.id), staleTime: 'static' })
      .then((user) => {
        // A missing user is a routing fact, so the status is set during SSR
        // while the not-found body still renders inside the shell.
        if (user === null) setStatus(404)
        return user
      })
      .catch((cause) => {
        // Start serializes a loader error onto the error page; log the real
        // cause server-side and rethrow a message safe to render.
        console.error('user detail loader failed', cause)
        throw new Error('This page could not be loaded.')
      }),
  head: ({ loaderData, params }) => ({
    meta: [{ title: userTitle(loaderData, params.id) }]
  }),
  component: UserPage
})
