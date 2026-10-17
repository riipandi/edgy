import { defineFileRoute } from '@solidjs/router/fs'
import { UserList } from './user-list.tsx'

/**
 * `/users`: the user directory. Its data arrives through `/rpc` in the plan's next phase; until
 * then the list renders empty and the page program (`src/web/user.ts`) answers the queries.
 */
export const route = defineFileRoute('/users', {})

function Users() {
  return (
    <div id='users-page-root'>
      <UserList users={[]} />
    </div>
  )
}

export default Users
