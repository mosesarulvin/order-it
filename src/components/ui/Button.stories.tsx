import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';
import { Trash2 } from 'lucide-react';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'icon'],
    },
    loading: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Primary Button',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: /primary button/i })).toBeVisible();
  },
};

export const CssCheck: Story = {
  args: {
    variant: 'danger',
    children: 'Danger Button',
  },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: /danger button/i });
    // danger variant has bg-red-500 (#ef4444 -> rgb(239, 68, 68))
    await expect(getComputedStyle(button).backgroundColor).toBe('rgb(239, 68, 68)');
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary Button',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline Button',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: 'Ghost Button',
  },
};

export const Danger: Story = {
  args: {
    variant: 'danger',
    children: 'Danger Button',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
    children: 'Small Button',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
    children: 'Large Button',
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    children: 'Loading...',
  },
};

export const WithIcon: Story = {
  args: {
    children: (
      <>
        <Trash2 size={16} /> Delete
      </>
    ),
  },
};
