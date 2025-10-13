import { test, expect } from '@playwright/test'

const storyId = 'pages-taskhistory--default'

test.describe('Storybook visuals', () => {
  test('TaskHistory default story matches snapshot', async ({ page }) => {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(250)
    await expect(page).toHaveScreenshot('task-history-default.png', { fullPage: true })
  })
})

