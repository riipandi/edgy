/** A minimal Solid page for the renderer tests: plain SSR primitives, no JSX needed. */
import { ssr, ssrElement } from '@solidjs/web'
export interface TestPageProps {
  readonly title: string
  readonly items: readonly string[]
}

export const TestPage = (props: TestPageProps) => [
  ssrElement(
    'section',
    {},
    [
      ssrElement('h1', {}, () => props.title, false),
      ssrElement(
        'ul',
        {},
        props.items.map((item) => ssrElement('li', {}, () => item, false)),
        false
      )
    ],
    false
  ),
  ssr(['<!-- rendered -->'])
]
