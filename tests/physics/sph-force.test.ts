import { describe, expect, it } from 'vitest';
import {
  createParticleSystem,
  createSpatialGrid,
  cubicSplineKernel,
  rebuildSpatialGrid,
  setParticle,
} from '../../src/physics';
import { computeSphDensity } from '../../src/physics/sph-density';
import { computeSphForcesAndEnergy } from '../../src/physics/sph-force';

describe('SPH pressure-gradient force + adiabatic energy update', () => {
  it('two gas particles: pressure force is equal and opposite (Newton 3)', () => {
    const ps = createParticleSystem(2);
    const m = 1;
    const r = 0.15;
    setParticle(ps, 0, -r / 2, 0, 0, 0, 0, 0, m);
    setParticle(ps, 1, r / 2, 0, 0, 0, 0, 0, m);
    const h = 0.3;
    const kernel = cubicSplineKernel(h);
    const grid = createSpatialGrid(ps, { cellSize: 2 * h, cellsPerSide: 8, origin: -2.4 });
    rebuildSpatialGrid(grid, ps);
    const densities = new Float32Array(2);
    computeSphDensity(ps, grid, kernel, densities);
    const u = new Float32Array([1, 1]);

    const out = {
      accelerations: new Float32Array(2 * 4),
      dudt: new Float32Array(2),
    };
    computeSphForcesAndEnergy(
      ps,
      grid,
      kernel,
      {
        gasStart: 0,
        gasCount: 2,
        gamma: 5 / 3,
        internalEnergy: u,
        densities,
      },
      out,
    );

    // Particle 0 at -x; particle 1 at +x. Pressure repels them, so 0 sees -x force, 1 sees +x.
    expect(out.accelerations[0]).toBeLessThan(0);
    expect(out.accelerations[4]).toBeGreaterThan(0);
    // Newton's third law: equal magnitude, opposite sign.
    expect(Math.abs((out.accelerations[0] ?? 0) + (out.accelerations[4] ?? 0))).toBeLessThan(1e-6);
  });

  it('two gas particles at rest: du/dt = 0 (no compression heating)', () => {
    const ps = createParticleSystem(2);
    setParticle(ps, 0, -0.05, 0, 0, 0, 0, 0, 1);
    setParticle(ps, 1, 0.05, 0, 0, 0, 0, 0, 1);
    const h = 0.2;
    const kernel = cubicSplineKernel(h);
    const grid = createSpatialGrid(ps, { cellSize: 2 * h, cellsPerSide: 8, origin: -1.6 });
    rebuildSpatialGrid(grid, ps);
    const densities = new Float32Array(2);
    computeSphDensity(ps, grid, kernel, densities);
    const u = new Float32Array([1, 1]);
    const out = {
      accelerations: new Float32Array(2 * 4),
      dudt: new Float32Array(2),
    };
    computeSphForcesAndEnergy(
      ps,
      grid,
      kernel,
      { gasStart: 0, gasCount: 2, gamma: 5 / 3, internalEnergy: u, densities },
      out,
    );
    expect(out.dudt[0]).toBeCloseTo(0, 6);
    expect(out.dudt[1]).toBeCloseTo(0, 6);
  });

  it('two gas particles approaching each other: both heat up (du/dt > 0)', () => {
    const ps = createParticleSystem(2);
    // Particle 0 at -x with +x velocity; particle 1 at +x with -x velocity.
    setParticle(ps, 0, -0.05, 0, 0, 1, 0, 0, 1);
    setParticle(ps, 1, 0.05, 0, 0, -1, 0, 0, 1);
    const h = 0.2;
    const kernel = cubicSplineKernel(h);
    const grid = createSpatialGrid(ps, { cellSize: 2 * h, cellsPerSide: 8, origin: -1.6 });
    rebuildSpatialGrid(grid, ps);
    const densities = new Float32Array(2);
    computeSphDensity(ps, grid, kernel, densities);
    const u = new Float32Array([1, 1]);
    const out = {
      accelerations: new Float32Array(2 * 4),
      dudt: new Float32Array(2),
    };
    computeSphForcesAndEnergy(
      ps,
      grid,
      kernel,
      { gasStart: 0, gasCount: 2, gamma: 5 / 3, internalEnergy: u, densities },
      out,
    );
    expect(out.dudt[0]).toBeGreaterThan(0);
    expect(out.dudt[1]).toBeGreaterThan(0);
  });

  it('gas-only force ignores DM neighbours', () => {
    // Particle 0 = DM at -x, particle 1 = gas at 0, particle 2 = gas at +x.
    // The DM particle at -x should NOT contribute to gas SPH force.
    const ps = createParticleSystem(3);
    setParticle(ps, 0, -0.1, 0, 0, 0, 0, 0, 1); // DM
    setParticle(ps, 1, 0.0, 0, 0, 0, 0, 0, 1); // gas
    setParticle(ps, 2, 0.1, 0, 0, 0, 0, 0, 1); // gas
    const h = 0.3;
    const kernel = cubicSplineKernel(h);
    const grid = createSpatialGrid(ps, { cellSize: 2 * h, cellsPerSide: 8, origin: -2.4 });
    rebuildSpatialGrid(grid, ps);

    // Densities: only gas matter for gas SPH. We give all particles density
    // and gas u, but the force pass should only sum gas-gas.
    const densities = new Float32Array(2);
    // density buffer indexed by gas particle (length = gasCount)
    densities[0] = 1; // gas particle at index 1
    densities[1] = 1; // gas particle at index 2
    const u = new Float32Array([1, 1]);
    const out = {
      accelerations: new Float32Array(2 * 4),
      dudt: new Float32Array(2),
    };
    computeSphForcesAndEnergy(
      ps,
      grid,
      kernel,
      { gasStart: 1, gasCount: 2, gamma: 5 / 3, internalEnergy: u, densities },
      out,
    );

    // Gas particle at x=0 should see force only from gas particle at x=+0.1
    // (push to -x, so ax < 0). It should NOT be pushed by the DM at x=-0.1.
    expect(out.accelerations[0]).toBeLessThan(0);
    // The other gas particle is the same magnitude, opposite direction.
    expect(out.accelerations[4]).toBeGreaterThan(0);
    expect(Math.abs((out.accelerations[0] ?? 0) + (out.accelerations[4] ?? 0))).toBeLessThan(1e-6);
  });
});
