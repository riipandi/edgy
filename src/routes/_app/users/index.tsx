import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/users/')({
  component: UsersPage
})

function UsersPage() {
  return (
    <main>
      <h1>Users</h1>
    </main>
  )
}
