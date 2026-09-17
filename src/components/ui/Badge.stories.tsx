import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['success', 'warning', 'danger', 'info', 'default', 'orange', 'outline'],
    },
    children: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Completed',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/completed/i)).toBeVisible();
  },
};

export const Warning: Story = {
  args: {
    variant: 'warning',
    children: 'Pending',
  },
};

export const ErrorBadge: Story = {
  args: {
    variant: 'danger',
    children: 'Failed',
  },
};

export const Info: Story = {
  args: {
    variant: 'info',
    children: 'New Feature',
  },
};

export const DefaultBadge: Story = {
  args: {
    variant: 'default',
    children: 'Draft',
  },
};
