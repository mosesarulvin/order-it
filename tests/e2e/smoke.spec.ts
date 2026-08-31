import { expect, test } from '@playwright/test'

test('landing renders without JS errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })

  await page.goto('/login')
  await expect(page.getByRole('heading')).toBeVisible()
  expect(errors, `page reported errors:\n${errors.join('\n')}`).toEqual([])
})
