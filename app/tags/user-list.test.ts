import { fireEvent, render, screen } from '@marko/testing-library'
import { describe, expect, it } from 'vitest'
import template from './user-list.marko'

const users = [
  { id: 'user_1', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'user_2', name: 'Alan Turing', email: 'alan@example.com' },
  { id: 'user_3', name: 'Grace Hopper', email: 'grace@example.com' }
]

// The `*.marko` declaration carries no input type; `mtc` checks the template's own.
const UserList = template as Marko.Template<{ users: typeof users }>

describe('user-list', () => {
  it('lists every user and the total', async () => {
    await render(UserList, { users })

    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Showing 3 of 3')).toBeInTheDocument()
  })

  it('narrows the list by name or email as the filter changes', async () => {
    await render(UserList, { users })
    const filter = screen.getByRole('searchbox', { name: 'Filter users' })

    await fireEvent.input(filter, { target: { value: ' GRACE@ ' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument()
    expect(screen.getByText('Showing 1 of 3')).toBeInTheDocument()

    await fireEvent.input(filter, { target: { value: 'ac' } })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('shows an empty list when nothing matches', async () => {
    await render(UserList, { users })

    await fireEvent.input(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText('Showing 0 of 3')).toBeInTheDocument()
  })

  it('follows new input on rerender', async () => {
    const view = await render(UserList, { users })

    await view.rerender({ users: users.slice(0, 1) })
    expect(screen.getByText('Showing 1 of 1')).toBeInTheDocument()
  })
})
