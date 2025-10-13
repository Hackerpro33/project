import { expect, test } from '@playwright/test';

test.describe('Insight Sphere smoke', () => {
  test('landing page is reachable', async ({ page }) => {
    test.skip(!process.env.PLAYWRIGHT_BASE_URL, 'PLAYWRIGHT_BASE_URL must point to a running frontend');

    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    await expect(page).toHaveURL(/.+/);
  });
});
