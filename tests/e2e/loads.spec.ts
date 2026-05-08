import { expect, test } from '@playwright/test';

test('loads the landing screen and the FPS overlay ticks', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Cosmic Seed/i);
  await expect(page.getByRole('heading', { name: /Cosmic Seed/i })).toBeVisible();

  const fps = page.getByTestId('fps-value');
  await expect(fps).toBeVisible();
  await expect(fps).not.toHaveText('—', { timeout: 4000 });
});
