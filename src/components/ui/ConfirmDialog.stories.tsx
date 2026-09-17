import type { Meta, StoryObj } from '@storybook/react';
import { ConfirmDialog } from './ConfirmDialog';

import { expect, fn } from 'storybook/test';

const meta = {
  title: 'UI/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    open: {
      control: 'boolean',
      description: 'Whether the dialog is open',
    },
    title: {
      control: 'text',
    },
    description: {
      control: 'text',
    },
    isDanger: {
      control: 'boolean',
    },
    loading: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed with this action?',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: false,
    loading: false,
    onClose: fn(),
    onConfirm: fn(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Are you sure you want to proceed with this action\?/i)).toBeVisible();
  },
};

export const DangerAction: Story = {
  args: {
    open: true,
    title: 'Delete Item',
    description: 'Are you sure you want to delete this item? This action cannot be undone.',
    confirmText: 'Delete',
    cancelText: 'Cancel',
    isDanger: true,
    loading: false,
    onClose: () => console.log('close'),
    onConfirm: () => console.log('confirm'),
  },
};

export const LoadingState: Story = {
  args: {
    open: true,
    title: 'Processing Request',
    description: 'Please wait while we process your request...',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    isDanger: false,
    loading: true,
    onClose: () => console.log('close'),
    onConfirm: () => console.log('confirm'),
  },
};
