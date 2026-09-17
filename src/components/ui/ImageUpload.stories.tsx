import type { Meta, StoryObj } from '@storybook/react';
import { ImageUpload } from './ImageUpload';
import { expect } from 'storybook/test';
import { useState } from 'react';

const meta = {
  title: 'UI/ImageUpload',
  component: ImageUpload,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
  argTypes: {
    label: { control: 'text' },
    description: { control: 'text' },
    imageUrl: { control: 'text' },
    loading: { control: 'boolean' },
    error: { control: 'text' },
    onChange: { action: 'changed' },
  },
} satisfies Meta<typeof ImageUpload>;

export default meta;
type Story = StoryObj<typeof meta>;

// Wrapper for interactive preview testing
const InteractiveWrapper = (args: any) => {
  const [url, setUrl] = useState<string | null>(args.imageUrl || null);
  
  const handleChange = (file: File | null) => {
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    } else {
      setUrl(null);
    }
  };

  return <ImageUpload {...args} imageUrl={url} onChange={handleChange} />;
};

export const Default: Story = {
  args: {
    label: 'Profile Picture',
    onChange: () => {},
  },
  play: async ({ canvas }) => {
    const uploadBtn = await canvas.findByRole('button', { name: /upload image/i });
    await expect(uploadBtn).toBeVisible();
  },
};

export const WithPreview: Story = {
  args: {
    label: 'Shop Logo',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&h=200&fit=crop',
    onChange: () => {},
  },
};

export const Interactive: Story = {
  render: (args) => <InteractiveWrapper {...args} />,
  args: {
    label: 'Upload a picture',
    onChange: () => {},
  },
};

export const Loading: Story = {
  args: {
    label: 'Uploading Document...',
    loading: true,
    onChange: () => {},
  },
};

export const WithError: Story = {
  args: {
    label: 'Cover Image',
    error: 'Image must be under 2MB',
    onChange: () => {},
  },
};
