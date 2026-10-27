import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/')({
  component: HomePage
})

function HomePage() {
  return (
    <main>
      <h1>Edgy</h1>
    </main>
  )
}
