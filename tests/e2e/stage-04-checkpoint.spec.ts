// Stage 4 visual checkpoint — captures the simulation after the cosmic
// dynamics have run long enough for halos to form and (often) for the
// first Pop III star to ignite. Output goes to docs/checkpoints/stage-04.png
// and is what we share when we want to show "this is what Stage 4 looks
// like": cosmic-web filaments, the bloomed first stars, and the in-scene
// annotation pin on the largest halo.

import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('captures the Stage 4 visual checkpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('simulation-canvas')).toBeVisible();

  // Let the simulation run long enough for the halo finder to fire several
  // times and the cooling channel to bring some gas below 10⁴ K. At
  // dtMyr = 0.2 with stepsPerFrame = 4, this is ~ 200 Myr of cosmic time —
  // typically enough for the first ignition pin to appear.
  await page.waitForTimeout(8000);

  const dir = path.resolve('docs/checkpoints');
  await mkdir(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, 'stage-04.png'),
    fullPage: false,
  });
});
