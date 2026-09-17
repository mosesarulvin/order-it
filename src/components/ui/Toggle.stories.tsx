import type { Meta, StoryObj } from '@storybook/react';
import { Toggle } from './Toggle';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Toggle',
  component: Toggle,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    onChange: { action: 'changed' },
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    checked: false,
    disabled: false,
    onChange: () => {},
  },
  play: async ({ canvas }) => {
    // We can't query by role "switch" unless Toggle uses it. We'll just verify the component renders.
    // The Toggle component renders a button, so we can check for that.
    await expect(canvas.getByRole('button')).toBeVisible();
  },
};

export const Checked: Story = {
  args: {
    checked: true,
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    checked: false,
    disabled: true,
    onChange: () => {},
  },
};

export const CheckedAndDisabled: Story = {
  args: {
    checked: true,
    disabled: true,
    onChange: () => {},
  },
};
