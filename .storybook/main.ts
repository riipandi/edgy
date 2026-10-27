import { defineMain } from '@storybook/react-vite/node'

export default defineMain({
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  framework: '@storybook/react-vite',
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true
  },
  features: {
    menuOnboardingChecklist: false,
    sidebarOnboardingChecklist: false
  }
})
