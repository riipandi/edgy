import addonDocs from '@storybook/addon-docs'
import { definePreview } from '@storybook/react-vite'
import '../src/resources/assets/globals.css'

export default definePreview({
  addons: [addonDocs()]
})
