import { describe, expect, it } from 'vitest';
import {
  computeDensities,
  createParticleSystem,
  createSpatialGrid,
  poly6Kernel,
  rebuildSpatialGrid,
  setParticle,
} from '../../src/physics';

describe('spatial grid + density', () => {
  it('rebuildSpatialGrid bins every particle into a cell', () => {
    const ps = createParticleSystem(4);
    setParticle(ps, 0, 0.0, 0.0, 0.0, 0, 0, 0, 1);
    setParticle(ps, 1, 0.5, 0.5, 0.5, 0, 0, 0, 1);
    setParticle(ps, 2, -0.4, 0.0, 0.0, 0, 0, 0, 1);
    setParticle(ps, 3, 0.9, -0.9, 0.9, 0, 0, 0, 1);
    const grid = createSpatialGrid(ps, { cellSize: 0.25, cellsPerSide: 16, origin: -2 });
    rebuildSpatialGrid(grid, ps);

    let visited = 0;
    for (const head of grid.cellHead) {
      let j = head;
      while (j !== -1) {
        visited += 1;
        j = grid.particleNext[j] ?? -1;
        if (visited > ps.count) throw new Error('cycle in spatial grid linked list');
      }
    }
    expect(visited).toBe(ps.count);
  });

  it('poly6 kernel integrates to ~ 1 over the support sphere', () => {
    const h = 0.5;
    const k = poly6Kernel(h);
    // Riemann sum on a regular cubic mesh; coarse but the kernel is smooth.
    const N = 30;
    const dx = (2 * h) / N;
    let sum = 0;
    for (let ix = 0; ix < N; ix += 1) {
      const x = -h + (ix + 0.5) * dx;
      for (let iy = 0; iy < N; iy += 1) {
        const y = -h + (iy + 0.5) * dx;
        for (let iz = 0; iz < N; iz += 1) {
          const z = -h + (iz + 0.5) * dx;
          const r = Math.sqrt(x * x + y * y + z * z);
          sum += k.weight(r) * dx * dx * dx;
        }
      }
    }
    expect(sum).toBeGreaterThan(0.9);
    expect(sum).toBeLessThan(1.1);
  });

  it('density at a clustered point is much higher than at an isolated one', () => {
    const ps = createParticleSystem(20);
    // 19 particles tightly clustered around the origin.
    let i = 0;
    for (; i < 19; i += 1) {
      const x = (i % 3) * 0.01 - 0.01;
      const y = (Math.floor(i / 3) % 3) * 0.01 - 0.01;
      const z = (Math.floor(i / 9) % 3) * 0.01 - 0.01;
      setParticle(ps, i, x, y, z, 0, 0, 0, 1);
    }
    // 1 lonely particle far away.
    setParticle(ps, i, 1.5, 1.5, 1.5, 0, 0, 0, 1);

    const cellSize = 0.2;
    const grid = createSpatialGrid(ps, { cellSize, cellsPerSide: 32, origin: -3 });
    rebuildSpatialGrid(grid, ps);
    const densities = new Float32Array(ps.count);
    computeDensities(ps, grid, poly6Kernel(0.18), densities);

    expect(densities[0]).toBeGreaterThan((densities[19] ?? 0) * 5);
  });
});
