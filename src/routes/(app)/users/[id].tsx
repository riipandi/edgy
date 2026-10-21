import { Title } from '@solidjs/meta'
import { query } from '@solidjs/router'
import type { RouteDefinition, RouteProps } from '@solidjs/router'
import { createMemo, isPending } from 'solid-js'
import { getUser } from '../../../modules/user/user_fn'
import { fx } from '../../../resources/styles/core/utils.stylex'
import { styles as userStyles } from '../../../resources/styles/pages/user.stylex'
import { sx } from '../../../resources/styles/props'
import { paths } from '../../../router'

// Async data loading: a query (cached per key) read through a memo — the
// surrounding <Loading> boundary (in app.tsx) shows its fallback until the
// promise settles. Data comes from the user API served by the Effect
// server; an unknown id renders the fallback copy.
const getUserQuery = query((id: string) => getUser(id), 'user')

export const route = {
  preload: ({ params }) => void getUserQuery(params.id!)
} satisfies RouteDefinition

export default function RouteComponent(props: RouteProps<'/users/:id'>) {
  const user = createMemo(() => getUserQuery(props.params.id))

  return (
    <section
      {...sx(userStyles.card, userStyles.detailSection)}
      style={{ opacity: isPending(user) ? 0.5 : 1 }}
    >
      <Title>{`User ${props.params.id} - Solid App`}</Title>
      <h2 {...sx(fx.h2, userStyles.detailTitle)}>{user().name}</h2>
      <p {...sx(fx.muted)}>{user().title}</p>
      <a {...sx(fx.link, fx.focusable, userStyles.detailBack)} href={paths.users()}>
        All users
      </a>
    </section>
  )
}
