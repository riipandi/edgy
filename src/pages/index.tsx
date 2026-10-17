import { defineFileRoute } from '@solidjs/router/fs'
import { link } from '../styles/components/link.css.ts'
import { detail, display, lead } from '../styles/elements/messages.css.ts'

/** `/`: the front page. It reads nothing, so it ships no interactivity. */
export const route = defineFileRoute('/', {})

function Home() {
  return (
    <>
      <h1 class={display}>edgy</h1>
      <p class={lead}>A server that renders pages and answers an API from the same code.</p>
      <p class={detail}>
        <a href='/users' class={link}>
          Browse the users
        </a>
        , or read them as JSON at{' '}
        <a href='/api/users' class={link}>
          /api/users
        </a>
        .
      </p>
    </>
  )
}

export default Home
