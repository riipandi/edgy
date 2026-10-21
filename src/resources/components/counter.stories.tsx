import preview from '../../../.storybook/preview.tsx'
import Counter from './counter.tsx'

const meta = preview.meta({
  component: Counter,
  title: 'Counter',
  parameters: {
    layout: 'centered'
  }
})

export const Default = meta.story({})
