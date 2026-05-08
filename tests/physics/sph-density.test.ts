import { describe, expect, it } from 'vitest';
import {
  createParticleSystem,
  createSpatialGrid,
  cubicSplineKernel,
  rebuildSpatialGrid,
  setParticle,
} from '../../src/physics';
import { computeSphDensity } from '../../src/physics/sph-density';

describe('SPH density estimator', () => {
  it('throws when output buffer length mismatches particle count', () => {
    const ps = createParticleSystem(2);
    const grid = createSpatialGrid(ps, { cellSize: 1, cellsPerSide: 4, origin: -2 });
    rebuildSpatialGrid(grid, ps);
    const wrongOut = new Float32Array(5);
    expect(() => {
      computeSphDensity(ps, grid, cubicSplineKernel(0.3), wrongOut);
    }).toThrow(/length/);
  });

  it('isolated particle has density m · σ₃ at its own location', () => {
    const ps = createParticleSystem(1);
    const m = 1.5;
    setParticle(ps, 0, 0, 0, 0, 0, 0, 0, m);
    const h = 0.4;
    const grid = createSpatialGrid(ps, { cellSize: 1.0, cellsPerSide: 4, origin: -2 });
    rebuildSpatialGrid(grid, ps);
    const out = new Float32Array(1);
    computeSphDensity(ps, grid, cubicSplineKernel(h), out);
    const sigma3 = 1 / (Math.PI * h * h * h);
    expect(out[0]).toBeCloseTo(m * sigma3, 6);
  });

  it('two adjacent particles each see both contributions', () => {
    const ps = createParticleSystem(2);
    const m = 1.0;
    const r = 0.2;
    setParticle(ps, 0, -r / 2, 0, 0, 0, 0, 0, m);
    setParticle(ps, 1, r / 2, 0, 0, 0, 0, 0, m);
    const h = 0.3;
    const grid = createSpatialGrid(ps, { cellSize: 0.6, cellsPerSide: 8, origin: -2.4 });
    rebuildSpatialGrid(grid, ps);
    const out = new Float32Array(2);
    computeSphDensity(ps, grid, cubicSplineKernel(h), out);
    const k = cubicSplineKernel(h);
    const expected = m * (k.weight(0) + k.weight(r));
    expect(out[0]).toBeCloseTo(expected, 5);
    expect(out[1]).toBeCloseTo(expected, 5);
  });

  it('uniform-density distribution recovers the input density', () => {
    // Place particles on a regular cubic lattice with spacing dx in a box.
    // Density should be ≈ m / dx³ everywhere except near the box edges.
    const N = 6;
    const dx = 0.2;
    const halfL = (N * dx) / 2;
    const ps = createParticleSystem(N * N * N);
    const m = 1 / (N * N * N); // arbitrary; ρ = m/dx³ in code units
    let idx = 0;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        for (let k = 0; k < N; k += 1) {
          const x = (i + 0.5) * dx - halfL;
          const y = (j + 0.5) * dx - halfL;
          const z = (k + 0.5) * dx - halfL;
          setParticle(ps, idx, x, y, z, 0, 0, 0, m);
          idx += 1;
        }
      }
    }
    const h = 1.5 * dx;
    const grid = createSpatialGrid(ps, {
      cellSize: 2 * h,
      cellsPerSide: Math.max(8, Math.ceil((4 * halfL) / (2 * h))),
      origin: -2 * halfL,
    });
    rebuildSpatialGrid(grid, ps);
    const out = new Float32Array(ps.count);
    computeSphDensity(ps, grid, cubicSplineKernel(h), out);

    // Sample interior particles only (avoid edge effects). Index of the
    // central (3,3,3) particle.
    const interior = [N / 2, N / 2 - 1].flatMap((i) =>
      [N / 2, N / 2 - 1].flatMap((j) => [N / 2, N / 2 - 1].map((k) => (i * N + j) * N + k)),
    );
    const expected = m / (dx * dx * dx);
    for (const i of interior) {
      const value = out[i] ?? 0;
      // Within ±10 % of m/dx³ for the cubic-spline kernel on a regular grid.
      expect(value).toBeGreaterThan(expected * 0.9);
      expect(value).toBeLessThan(expected * 1.1);
    }
  });

  it('density falls off outside a clustered region', () => {
    const ps = createParticleSystem(11);
    const m = 1;
    // 10 particles tightly bunched at origin
    for (let i = 0; i < 10; i += 1) {
      const x = (i % 3) * 0.01 - 0.01;
      const y = (Math.floor(i / 3) % 3) * 0.01 - 0.01;
      const z = (Math.floor(i / 9) % 3) * 0.01 - 0.01;
      setParticle(ps, i, x, y, z, 0, 0, 0, m);
    }
    // 1 lonely particle far away
    setParticle(ps, 10, 1.5, 0, 0, 0, 0, 0, m);

    const h = 0.2;
    const grid = createSpatialGrid(ps, { cellSize: 2 * h, cellsPerSide: 16, origin: -3 });
    rebuildSpatialGrid(grid, ps);
    const out = new Float32Array(ps.count);
    computeSphDensity(ps, grid, cubicSplineKernel(h), out);
    expect(out[0]).toBeGreaterThan((out[10] ?? 0) * 5);
  });
});
