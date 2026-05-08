import { describe, expect, it } from 'vitest';
import {
  computeAccelerations,
  createLeapfrogState,
  energyReport,
  leapfrogStep,
  plummerSphere,
} from '../../src/physics';

describe('Plummer sphere', () => {
  // For an equilibrium Plummer model the virial theorem is 2T + U = 0,
  // i.e. −T/U = 0.5. The Aarseth–Hénon–Wielen sampling reproduces this
  // up to finite-N noise; with N=400 we expect ≲ 5 % deviation.
  it('initial virial ratio is ≈ 0.5 (within 10 % at N = 400)', () => {
    const G = 1;
    const ps = plummerSphere({ count: 400, seed: 21, scale: 1, totalMass: 1, G });
    const opts = { softening: 0.05, G };
    const { virialRatio } = energyReport(ps, opts);
    expect(virialRatio).toBeGreaterThan(0.4);
    expect(virialRatio).toBeLessThan(0.6);
  });

  // After integrating for several dynamical times the cluster should still
  // be in the virial range. We allow a wider band (0.3–0.7) here because
  // a finite-N Plummer model self-relaxes a bit from its sampled state.
  it('stays in the virial range after ~ 5 dynamical times', () => {
    const G = 1;
    const M = 1;
    const a = 1;
    const ps = plummerSphere({ count: 400, seed: 22, scale: a, totalMass: M, G });
    const opts = { softening: 0.05, G };
    const tDyn = Math.sqrt(a ** 3 / (G * M));
    const dt = tDyn / 200;

    const state = createLeapfrogState(ps, (s) => {
      computeAccelerations(s, opts);
    });
    for (let i = 0; i < 5 * 200; i += 1) leapfrogStep(state, dt);

    const { virialRatio } = energyReport(ps, opts);
    expect(virialRatio).toBeGreaterThan(0.3);
    expect(virialRatio).toBeLessThan(0.7);
  });
});
