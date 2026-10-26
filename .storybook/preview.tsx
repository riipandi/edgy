import addonDocs from '@storybook/addon-docs'
import { definePreview } from 'storybook-solidjs-vite'
import '../src/assets/globals.css'

export default definePreview({
  addons: [addonDocs()]
})
