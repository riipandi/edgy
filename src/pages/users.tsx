import { defineFileRoute } from '@solidjs/router/fs'
import { UserList } from './user-list.tsx'

/**
 * `/users`: the user directory. The list loads from `/rpc` in the browser (`user-list.tsx`);
 * the server render draws the shell.
 */
export const route = defineFileRoute('/users', {})

function Users() {
  return (
    <div id='users-page-root'>
      <UserList />
    </div>
  )
}

export default Users
