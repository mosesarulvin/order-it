import type { Meta, StoryObj } from '@storybook/react';
import { Radio } from './Radio';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Radio',
  component: Radio,
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
} satisfies Meta<typeof Radio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: 'Standard delivery',
    description: '4-6 business days',
    id: 'delivery-standard',
    name: 'delivery',
  },
  play: async ({ canvas, userEvent }) => {
    const radio = await canvas.findByRole('radio');
    await expect(radio).toBeVisible();
    await userEvent.click(radio);
    await expect(radio).toBeChecked();
  },
};

export const Group: Story = {
  render: () => (
    <div className="space-y-4">
      <Radio label="Option 1" name="group-1" id="opt-1" />
      <Radio label="Option 2" name="group-1" id="opt-2" />
      <Radio label="Option 3" name="group-1" id="opt-3" disabled />
    </div>
  ),
};

export const WithError: Story = {
  args: {
    label: 'Required selection',
    error: 'Please make a selection',
    id: 'error-radio',
  },
};
