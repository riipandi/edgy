import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/users/$id')({
  component: UserPage
})

function UserPage() {
  const { id } = Route.useParams()
  return (
    <main>
      <h1>User {id}</h1>
    </main>
  )
}
