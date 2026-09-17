import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './Input';
import { Mail, Search } from 'lucide-react';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    label: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
    placeholder: { control: 'text' },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text here...',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByPlaceholderText(/enter text here/i)).toBeVisible();
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Email Address',
    placeholder: 'you@example.com',
    type: 'email',
  },
};

export const WithError: Story = {
  args: {
    label: 'Username',
    placeholder: 'Enter username',
    error: 'This username is already taken.',
  },
};

export const WithIcon: Story = {
  args: {
    placeholder: 'Search...',
    icon: <Search size={18} className="text-gray-400" />,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Company Name',
    placeholder: 'Not editable',
    disabled: true,
  },
};
