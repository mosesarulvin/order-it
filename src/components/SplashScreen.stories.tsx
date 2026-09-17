import type { Meta, StoryObj } from '@storybook/react';
import { SplashScreen } from './SplashScreen';
import { expect } from 'storybook/test';

const meta = {
  title: 'App/SplashScreen',
  component: SplashScreen,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['ai-generated', 'needs-work'],
} satisfies Meta<typeof SplashScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    shopName: 'Order-it',
    onComplete: () => {},
  },
  play: async ({ canvas }) => {
    // Wait for the app title to be visible. The app title is "Order-it" in the SplashScreen.
    const title = await canvas.findByText(/order-it/i);
    await expect(title).toBeVisible();
  },
};
