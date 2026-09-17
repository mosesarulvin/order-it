import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './Skeleton';
import { expect } from 'storybook/test';

const meta = {
  title: 'UI/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['ai-generated', 'needs-work'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    className: 'w-[200px] h-4',
  },
  play: async ({ canvasElement }) => {
    // The skeleton is just a div with a class. We can check if it exists in the canvas.
    // It doesn't have text or role, so we can query by a generic selector.
    const skeleton = canvasElement.querySelector('.animate-pulse');
    await expect(skeleton).toBeVisible();
  },
};

export const Circular: Story = {
  args: {
    className: 'w-12 h-12 rounded-full',
  },
};

export const CardSkeleton: Story = {
  render: () => (
    <div className="flex flex-col space-y-3 w-[350px]">
      <Skeleton className="h-[125px] w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  ),
};
