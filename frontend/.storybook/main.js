import { mergeConfig } from 'vite'
import path from 'path'

const config = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions', '@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  viteFinal: async (baseConfig) => {
    return mergeConfig(baseConfig, {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
        },
      },
    })
  },
}

export default config

