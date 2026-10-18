import { defineMain } from 'storybook-solidjs-vite'

export default defineMain({
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-docs', '@storybook/addon-vitest'],
  framework: 'storybook-solidjs-vite',
  core: {
    disableTelemetry: true,
    disableWhatsNewNotifications: true
  },
  features: {
    menuOnboardingChecklist: false,
    sidebarOnboardingChecklist: false
  }
})
