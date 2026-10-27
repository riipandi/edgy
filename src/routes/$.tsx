import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$')({
  component: NotFoundPage
})

function NotFoundPage() {
  return (
    <main>
      <h1>Not found</h1>
    </main>
  )
}
