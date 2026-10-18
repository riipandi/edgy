import { createSignal } from 'solid-js'
import { styles as button } from '../../resources/styles/components/button.stylex'
import { sx } from '../styles/props'

export default function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <button {...sx(button)} onClick={() => setCount(count() + 1)} type='button'>
      Clicks: {count()}
    </button>
  )
}
