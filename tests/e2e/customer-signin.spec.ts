/**
 * Smoke test: the customer sign-in page loads and its client-side validation
 * rejects bad input. Deliberately does not hit Supabase — a bad phone number
 * should be caught by the shared zod schema before any RPC fires.
 */
import { expect, test } from '@playwright/test'

test('customer sign-in page validates phone and password locally', async ({ page }) => {
  const shopSlug = process.env.E2E_SHOP_SLUG ?? 'demo'
  await page.goto(`/order/${shopSlug}/profile`)

  await page.getByRole('button', { name: /Sign In with Phone Number/i }).click()
  await expect(page.getByRole('heading', { name: /Sign in to your profile/i })).toBeVisible()

  // Bad phone → toast shows the schema error, no network call to Supabase.
  await page.getByPlaceholder('9876543210').fill('123')
  await page.getByPlaceholder('••••••••').fill('doesntmatter')
  await page.getByRole('button', { name: /^Log In$/i }).click()
  await expect(page.getByText(/10-digit Indian mobile number/i)).toBeVisible()
})
