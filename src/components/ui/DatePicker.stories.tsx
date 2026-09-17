import type { Meta, StoryObj } from '@storybook/react';
import { DatePicker } from './DatePicker';
import { expect } from 'storybook/test';
import { useState } from 'react';

const meta = {
  title: 'UI/DatePicker',
  component: DatePicker,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    value: { control: 'text' },
    onChange: { action: 'changed' },
    placeholder: { control: 'text' },
    label: { control: 'text' },
    error: { control: 'text' },
  },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper to handle state for the Interactive story
const DatePickerWrapper = (args: any) => {
  const [date, setDate] = useState<string | undefined>(args.value);
  return <DatePicker {...args} value={date} onChange={setDate} />;
};

export const Default: Story = {
  render: (args) => <DatePickerWrapper {...args} />,
  args: {
    label: 'Select Event Date',
    value: undefined,
    onChange: () => {},
  },
  play: async ({ canvas, userEvent }) => {
    // Wait for the button
    const button = await canvas.findByRole('button');
    await expect(button).toBeVisible();
    
    // Click to open popover
    await userEvent.click(button);
    
    // Check if a calendar day appears (the popover mounts outside, so we can't use canvas to query it usually, unless we use canvasElement.ownerDocument)
  },
};

export const WithError: Story = {
  render: (args) => <DatePickerWrapper {...args} />,
  args: {
    label: 'Expiry Date',
    error: 'Date cannot be in the past.',
    value: undefined,
    onChange: () => {},
  },
};
