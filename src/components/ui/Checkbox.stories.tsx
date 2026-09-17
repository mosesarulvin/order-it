import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Checkbox',
  component: Checkbox,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
    checked: { control: 'boolean' },
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Accept terms and conditions',
    id: 'terms',
  },
  play: async ({ canvas, userEvent }) => {
    const checkbox = await canvas.findByRole('checkbox');
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Email Notifications',
    description: 'Get notified when someone messages you or replies to a thread.',
    id: 'notifications',
  },
};

export const WithError: Story = {
  args: {
    label: 'Required field',
    error: 'You must check this box to continue.',
    id: 'error-box',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled option',
    description: 'This option is currently unavailable.',
    disabled: true,
    id: 'disabled-box',
  },
};
