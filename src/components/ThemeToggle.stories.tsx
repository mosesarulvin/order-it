import type { Meta, StoryObj } from '@storybook/react';
import { ThemeToggle } from './ThemeToggle';
import { expect } from 'storybook/test';

const meta = {
  title: 'App/ThemeToggle',
  component: ThemeToggle,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    isDarkBackground: { control: 'boolean' },
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isDarkBackground: false,
  },
  play: async ({ canvas, userEvent }) => {
    const toggleBtn = await canvas.findByRole('button', { name: /toggle theme/i });
    await expect(toggleBtn).toBeVisible();
    
    // Open the dropdown
    await userEvent.click(toggleBtn);
    
    // Verify dropdown items appear
    const lightBtn = await canvas.findByText(/light/i);
    await expect(lightBtn).toBeVisible();
  },
};

export const DarkBackground: Story = {
  parameters: {
    backgrounds: { default: 'dark' },
  },
  args: {
    isDarkBackground: false,
  },
};
