import { expect, test } from '@playwright/test';

test('renders the simulation canvas, HUD, and a running step counter', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Cosmic Seed/i);
  await expect(page.getByTestId('simulation-canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Spherical Collapse/i })).toBeVisible();

  // Wait for the run-state badge to flip to "running".
  const status = page.getByText(/running|paused/i);
  await expect(status).toBeVisible({ timeout: 3000 });

  // FPS should populate within a few HUD ticks.
  const fpsRow = page.getByText('fps').first();
  await expect(fpsRow).toBeVisible({ timeout: 3000 });
});
