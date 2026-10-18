import { captureArtifact, expectNoDiagnostics, expectRerunBudget } from '@solidjs/diagnostics'
import { render, fireEvent } from '@solidjs/testing-library'
import { flush } from 'solid-js'
import { describe, expect, test } from 'vite-plus/test'
import Counter from './counter'

describe('<Counter />', () => {
  test('it increments on click', () => {
    const view = render(() => <Counter />)
    const button = view.getByRole('button')
    expect(button).toHaveTextContent('Clicks: 0')
    fireEvent.click(button)
    flush() // Solid batches DOM updates; flush() applies them synchronously.
    expect(button).toHaveTextContent('Clicks: 1')
  })

  test('a click re-runs one scope and trips no diagnostic', async () => {
    const { artifact } = await captureArtifact(
      () => {
        const view = render(() => <Counter />)
        const button = view.getByRole('button')
        fireEvent.click(button)
        flush()
        expect(button).toHaveTextContent('Clicks: 1')
      },
      { scenario: 'counter-click' }
    )
    expectNoDiagnostics(artifact)
    expectRerunBudget(artifact, 1)
  })
})
