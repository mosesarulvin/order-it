import type { Preview } from '@storybook/react-vite'
import { ThemeProvider } from '../src/contexts/ThemeProvider'
import '../src/index.css';

const preview: Preview = {
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="bg-white dark:bg-slate-900 min-h-[200px] w-full p-4 transition-colors">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },

    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: 'todo'
    },
    backgrounds: {
      default: 'light',
      values: [
        {
          name: 'light',
          value: '#f9fafb', // bg-gray-50
        },
        {
          name: 'dark',
          value: '#0f172a', // bg-slate-900
        },
      ],
    },
  },
};

export default preview;