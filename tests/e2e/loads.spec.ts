import { expect, test } from '@playwright/test';

test('renders the simulation canvas, HUD, and a running step counter', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Cosmic Seed/i);
  await expect(page.getByTestId('simulation-canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Spherical Collapse/i })).toBeVisible();

  // Run-state badge should flip to "running" within a few frames.
  const runState = page.getByTestId('run-state');
  await expect(runState).toBeVisible();
  await expect(runState).toHaveText(/running/i, { timeout: 3000 });
});
