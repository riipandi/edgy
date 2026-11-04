import * as stylex from '@stylexjs/stylex'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { TanStackDevtoolsReactInit } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { sx } from '#/resources/styles/props.ts'

const styles = stylex.create({
  trigger: {
    position: 'fixed',
    bottom: 8,
    right: 8,
    padding: 6,
    fontSize: 16,
    lineHeight: 1,
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.15)',
      borderColor: 'rgba(255,255,255,0.4)'
    }
  }
})

export default function DevTools({ queryClient }: { queryClient: QueryClient }) {
  const devToolsOptions: Partial<TanStackDevtoolsReactInit> = {
    config: {
      position: 'bottom-right',
      panelLocation: 'bottom',
      inspectHotkey: ['Alt', 'CtrlOrMeta'],
      openHotkey: ['Shift', 'D'],
      hideInAutomation: true,
      hideUntilHover: false,
      requireUrlFlag: false,
      urlFlag: 'devtools',
      customTrigger: (
        <button type='button' {...sx(styles.trigger)}>
          🛠️
        </button>
      ),
      theme: 'dark'
    },
    plugins: [
      {
        name: 'TanStack Query',
        render: <ReactQueryDevtoolsPanel client={queryClient} theme='dark' />,
        defaultOpen: true
      },
      {
        name: 'TanStack Router',
        render: <TanStackRouterDevtoolsPanel />,
        defaultOpen: false
      }
    ]
  }

  return import.meta.env.DEV ? <TanStackDevtools {...devToolsOptions} /> : null
}
