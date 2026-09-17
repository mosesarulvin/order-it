import type { Meta, StoryObj } from '@storybook/react';
import { CancelOrderModal } from './CancelOrderModal';
import { expect, fn } from 'storybook/test';

const meta = {
  title: 'App/CancelOrderModal',
  component: CancelOrderModal,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    open: { control: 'boolean' },
    orderNumber: { control: 'text' },
    onClose: { action: 'closed' },
    onConfirm: { action: 'confirmed' },
  },
} satisfies Meta<typeof CancelOrderModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    orderNumber: '#1024',
    onClose: fn(),
    onConfirm: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    // Wait for render
    const submitBtn = await canvas.findByRole('button', { name: /cancel order/i });
    await expect(submitBtn).toBeDisabled();
    
    // Select a preset reason
    const reasonBtn = await canvas.findByRole('button', { name: /item out of stock/i });
    await userEvent.click(reasonBtn);
    
    // Submit should now be enabled
    await expect(submitBtn).toBeEnabled();
  },
};

export const CustomReason: Story = {
  args: {
    open: true,
    orderNumber: '#1025',
    onClose: fn(),
    onConfirm: fn(),
  },
  play: async ({ canvas, userEvent }) => {
    // Click "Other"
    const otherBtn = await canvas.findByRole('button', { name: /other \(type your own\)/i });
    await userEvent.click(otherBtn);
    
    // Type in textarea
    const textarea = await canvas.findByPlaceholderText(/describe the reason/i);
    await userEvent.type(textarea, 'Customer called and cancelled', { delay: 10 });
    
    const submitBtn = await canvas.findByRole('button', { name: /cancel order/i });
    await expect(submitBtn).toBeEnabled();
  },
};
