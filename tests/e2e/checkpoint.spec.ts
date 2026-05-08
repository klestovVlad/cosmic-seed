import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('captures the Stage 1 visual checkpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('simulation-canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Spherical Collapse/i })).toBeVisible();

  // Let the simulation settle into the collapsed phase before snapping.
  await page.waitForTimeout(2500);

  const dir = path.resolve('docs/checkpoints');
  await mkdir(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, 'stage-01.png'),
    fullPage: false,
  });
});
