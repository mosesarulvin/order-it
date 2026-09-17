import type { Meta, StoryObj } from '@storybook/react';
import { Select } from './Select';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Select',
  component: Select,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    label: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Category',
    children: (
      <>
        <option value="">Select a category</option>
        <option value="1">Starters</option>
        <option value="2">Mains</option>
        <option value="3">Desserts</option>
      </>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox')).toBeVisible();
  },
};

export const WithError: Story = {
  args: {
    label: 'Category',
    error: 'Please select a valid category',
    children: (
      <>
        <option value="">Select a category</option>
      </>
    ),
  },
};

export const Disabled: Story = {
  args: {
    label: 'Category',
    disabled: true,
    children: (
      <>
        <option value="">Starters</option>
      </>
    ),
  },
};
