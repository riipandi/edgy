import { Link, createFileRoute } from '@tanstack/react-router'
import { getUser } from '#/modules/identity/user/user_fns.ts'
import { fx } from '#/resources/styles/core/utils.stylex.ts'
import { styles as userStyles } from '#/resources/styles/pages/user.stylex.ts'
import { sx } from '#/resources/styles/props.ts'

function userTitle(data: Awaited<ReturnType<typeof getUser>> | undefined, id: string): string {
  return data?.user === undefined ? 'User not found' : `User ${id} - Edgy`
}

function UserPage() {
  // The route's own useLoaderData call sits in a type cycle inside its
  // defining file, and Start's serialized fn type drops the top-level
  // undefined the handler really returns; the annotation states both truths.
  const data: Awaited<ReturnType<typeof getUser>> | undefined = Route.useLoaderData()
  const user = data?.user
  return (
    <section {...sx(userStyles.card, userStyles.detailSection)}>
      {user === undefined ? (
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

export const Route = createFileRoute('/_app/users/$id')({
  head: ({ loaderData, params }) => ({
    meta: [{ title: userTitle(loaderData, params.id) }]
  }),
  component: UserPage
})
